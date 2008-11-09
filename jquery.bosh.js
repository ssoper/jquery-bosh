(function($) {

	var settings = {
		protocol: 'http://jabber.org/protocol/httpbind',
		xmlns: 'urn:ietf:params:xml:ns:xmpp',
		resource: 'jquery-bosh',
		port: 5222,
		debug: true // FIXME: Change back to false on release
	};

  var errors = {
    not_authorized: 'Invalid login'
  };

	var generateRid = function() {
		return Math.round(100000.5 + (((900000.49999) - (100000.5)) * Math.random()));
	};
	
  var startTag = function(name, attrs) {
    var buf = '<' + name;
    if (attrs) {
      $.each(attrs, function(k, v) {
        k = k.replace(/_/, ':');
        buf += ' ' + k + '=\'' + v + '\'';      
      });
    }
    return buf;
  };

  var buildTag = function(name, attrs, contents) {
    if (attrs && attrs.constructor == String) {
      contents = attrs;
      attrs = {};
    }
    
    var buf = startTag(name, attrs);
    
    if (contents) {
      buf += '>';    
      if (contents instanceof Array) {
        for (var i=0; i<contents.length; ++i) {
          buf += buildTag.apply(null, contents[i]);
        }
      } else {
        buf += contents;
      }
      buf += '</' + name + '>';
    } else {
      buf += '/>';
    }
    return buf;
  };

	var toText = function( xmlResponse ) {
		if (xmlResponse == null) return false;
		if (typeof xmlResponse.xml != 'undefined') return xmlResponse.xml;
		if (typeof XMLSerializer == 'function') return (new XMLSerializer()).serializeToString(xmlResponse);
		return false;
	};

	var log = function( data, header ) {
		if (!settings.debug) return true
		if (typeof console == 'undefined') return true
		try {
			if (header) console.log(header);
			if (typeof data.documentElement == 'undefined') 
				console.log(data);
			else
				console.log(toText(data));
		} catch (exception) {
			console.log(exception);
		}
	};

  var SessionError = function(type, message) {
    this.type = type;
    this.message = message;
  };

  var Sender = function ( packet ) {
    this.jid = null;
    this.domain = null;
    this.name = null;
    this.client = null;
    
    var sender = packet.getAttribute('from') || packet.getAttribute('jid');
    
    if (sender) {
      if (sender.split("@").length > 1) {      
        var from = sender.split("/")[0];
        this.jid = from;
        this.name = from.split('@')[0];
        this.domain = from.split('@')[1];
      }
      if (sender.split("/").length > 1)
        this.client = sender.split("/")[1];
    }
  };

	var Message = function( packet ) {
		this.from = null;
		this.message = null;
		this.timestamp = null;
    this.raw = packet;

		this.from = new Sender(packet);

		if ($('body', packet).length > 0)
      this.message = $.trim($('body', packet).text());

		if ($('x[stamp]', packet).length > 0) {
			ts = $('x[stamp]', packet).attr('stamp');
			this.timestamp = new Date();
			this.timestamp.setUTCFullYear(Number(ts.substr(0, 4)));
			this.timestamp.setUTCMonth(Number(ts.substr(4, 2)) - 1); // Javscript months are 0-11
			this.timestamp.setUTCDate(Number(ts.substr(6, 2)));
			this.timestamp.setUTCHours(Number(ts.substr(9, 2)));
			this.timestamp.setUTCMinutes(Number(ts.substr(12, 2)));
			this.timestamp.setUTCSeconds(Number(ts.substr(15, 2)));
		}
	};

  var Presence = function( packet ) {
    this.from = new Sender(packet);
    this.available = packet.getAttribute('type') == 'unavailable' ? false : true;
  };

  var Roster = function() {
    this.items = [];
    
    this.find = function( presence ) {
      var result = null;
      $(this.items).each(function(k, v) {
        if (presence.from.jid == v.from.jid) result = k;
      });
      return result;
    };

    this.push = function( presence ) {
      found = this.find(presence);
      if (found == null) 
        this.items.push(presence);
      else 
        this.items[found] = presence;
    };
    
    this.clear = function() {
      this.items = [];
    };
  };

  var Private = function (session, url, username, password, domain) {
    this.session = session;
    this.url = url.match(/^https?:\/\//) == null ? 'http://' + url : url;
    this.username = username;
    this.password = password;
    this.domain = domain;
    this.route = 'xmpp:' + domain + ':' + settings.port;
    this.jid = username + '@' + domain;
    this.rid = generateRid();
		this.connected = false;
		this.error = null;
		this.roster = new Roster();

    this.callbacks = {
      login: {
        success: null,
        failure: null
      },
      message: {
        received: null,
        sent: null
      },
      subscription: {
        request: null,
        confirmation: null
      },
      roster: {
        updated: null
      }
    };

    this.queues = {
      messages: [],
      subscription: {
        requests: [],
        confirmations: []
      }
    };
  };

  Private.prototype = {
		open: function() {
		  var self = this;
			if (self.connected) return true;

			var attributes = {
				hold: 1, 
				wait: 298, 
				secure: false,
				ver: '1.6',
				xmpp_xmlns: 'urn:xmpp:xbosh',
				xmpp_version: '1.0'
			};

			$.extend(attributes, { to: self.domain, route: self.route, rid: self.rid, xmlns: settings.protocol });

  		var login = function( response ) {
  			$.each(['sid', 'wait', 'ver', 'inactivity', 'requests'], function(k, v) {
  				self[v] = response.documentElement.getAttribute(v);
  			});

  			var auth = $.base64Encode(self.username + '@' + self.domain + String.fromCharCode(0) + self.username + String.fromCharCode(0) + self.password);
  			var xmlns = settings.xmlns + "-sasl";
  			var data = buildTag.apply(null, ['auth', { xmlns: xmlns, mechanism: 'PLAIN' }, auth]);
        var packet = self.body({}, data);
  			self.send(packet, bindToStream);
  		};

  		var bindToStream = function( response ) {
  		  var data = buildTag.apply(null, ['iq', { xmlns: 'jabber:client', to: self.domain, type: 'set', id: 'bind_1' },
                                          [['bind', { xmlns: settings.xmlns + "-bind" }, 
		                                        [['resource', settings.resource]]]]]);
  			var packet = self.body({ xmpp_restart: 'true' }, data);
        self.send(packet, startSession);
  		};

  		var startSession = function( response ) {
  		  var data = buildTag.apply(null, ['iq', { xmlns: 'jabber:client', to: self.domain, type: 'set', id: 'sess_1' },
                                          [['session', { xmlns: settings.xmlns + "-session" }]]]);
  			var packet = self.body({}, data);
        self.send(packet, setPresence);
  		};

  		var setPresence = function( response ) {
  		  var data = buildTag.apply(null, ['presence', { xmlns: 'jabber:client' }]);
        var packet = self.body({}, data);
  			self.send(packet, completeLogin);
  		};

      var completeLogin = function( response ) {
  			self.connected = true;
  			self.ingestPresences(response, self);
  			self.ingestMessages(response, self);
				self.fillRoster(self);
      };

			self.send(buildTag.apply(null, ['body', attributes]), login);  		
		},

		close: function() {
		  var self = this;
		  var data = buildTag.apply(null, ['presence', { type: 'unavailable', xmlns: 'jabber:client' }]);
			var packet = this.body({ type: 'terminate' }, data);

			var completeLogout = function( response ) {
  			self.sid = null;
  			self.rid = generateRid();
  			self.connected = false;
      };

			self.send(packet, completeLogout);
		},

		ingestMessages: function( data, self ) {
			self.queues.messages = [];
			$('message', data).each(function(k, v) { 
				self.queues.messages.push(new Message(v));
			});

      if (self.callbacks.message.received && self.queues.messages.length > 0) 
        self.callbacks.message.received();
		},

    ingestSubscriptionRequests: function( data, self ) {
      self.queues.subscription.requests = [];
      $('presence[type="subscribe"]', data).each(function(k, v) {
        self.queues.subscription.requests.push(new Presence(v));
      });

      if (self.callbacks.subscription.request && self.queues.subscription.requests.length > 0) 
        self.callbacks.subscription.request();
    },

    ingestSubscriptionConfirmations: function( data, self ) {
      self.queues.subscription.confirmations = [];
      $('presence[type="subscribed"]', data).each(function(k, v) {
        self.queues.subscription.confirmations.push(new Presence(v));
      });

      if (self.callbacks.subscription.confirmation && self.queues.subscription.confirmations.length > 0) 
        self.callbacks.subscription.confirmation();
    },

    ingestPresences: function( data, self ) {
      $('presence', data).each(function(k, v) {
        var username = v.getAttribute('from').split('@')[0]
        if (username != self.username) self.roster.push(new Presence(v));
      });
      
      if (self.callbacks.roster.updated) self.callbacks.roster.updated();
    },

    listen: function() {
      this.send(this.body({}), this.ingestPacket);
    },

    ingestPacket: function( response, self ) {
      //if ($('message', response).length > 0)
        self.ingestMessages(response, self);
      
      if ($('presence', response).length > 0) {
        //if ($('presence[type="subscribe"]', response).length > 0)
          self.ingestSubscriptionRequests(response, self);
        //else if ($('presence[type="subscribed"]', response).length > 0)
          self.ingestSubscriptionConfirmations(response, self);
        //else
          self.ingestPresences(response, self);
      }

      self.listen();
    },

    checkForFailure: function( received, self ) {
      if ($('failure', received).length > 0) {
        error = $('failure', received)[0].firstChild.tagName.replace("-", "_");
        $(errors).each(function(k, v) {
          if (v[error]) self.error = new SessionError(error, v[error])
        });

        // Error received did not match any in errors hash
        if (!self.error) self.error = new SessionError('unknown', error)

        // Login has not been compeleted and a failure callback exists 
        if (!self.connected && self.callbacks.login.failure) self.callbacks.login.failure();

        return false;
      }

      return true;
    },

		requestSubscription: function( recipient ) {
			if (!this.connected) return false;

			var recipientJid = this.parseJid(recipient);
			var data = buildTag.apply(null, ['presence', { xmlns: 'jabber:client', to: recipientJid, type: 'subscribe' }])
			var packet = this.body({}, data);
      this.send(packet);
		},

		approveSubscription: function( recipient ) {
			if (!this.connected) return false;

			var recipientJid = this.parseJid(recipient);
			var data = buildTag.apply(null, ['presence', { xmlns: 'jabber:client', to: recipientJid, type: 'subscribed' }])
			var packet = this.body({}, data);
      this.send(packet);
		},

		sendMessage: function( recipient, msg ) {
			if (!this.connected) return false;

			var recipientJid = this.parseJid(recipient);
			var fromJid = this.username + '@' + this.domain;
			var data = buildTag.apply(null, ['message', { xmlns: 'jabber:client', to: recipientJid, from: fromJid }, 
			                                  [['body', msg]]]);
			var packet = this.body({}, data);
      this.send(packet);
		},

		fillRoster: function( self ) {
			if (!self.connected) return false;

			var from = this.username + '@' + this.domain;
			var data = buildTag.apply(null, ['iq', { xmlns: 'jabber:client', from: from, type: 'get', id: 'roster_1' },
                                        [['query', { xmlns: 'jabber:iq:roster' }]]]);
			var packet = this.body({}, data);

      self.send(packet, function( data, self ) {
        $('query > item[subscription!="none"]', data).each(function(k, v) {
          var presence = new Presence(v);
          presence.available = false;
          if (self.roster.find(presence) == null) self.roster.push(presence);
        });

        // Login has succeeded and a success callback exists
  			if (self.callbacks.login.success) self.callbacks.login.success();
  			
  			self.listen();
      });
		},

    parseJid: function( recipient ) {
      return (recipient.split('@').length > 1) ? recipient : recipient + '@' + this.domain;
    },

		incrementRid: function() {
			this.rid += 1;
			return this.rid;
		},

		body: function( attrs, data ) {
			$.extend(attrs, { rid: this.incrementRid(), sid: this.sid, xmlns: settings.protocol });
			return buildTag.apply(null, ['body', attrs, data]);
		},

    send: function(payload, onSuccess, onFailure) {
      if (!onFailure) onFailure = log;

      var self = this;
    	log(payload, '-Sent-');

  	  $.ajax({
  		  type: "POST",
  		  url: self.url,
  		  data: payload,
  		  dataType: "xml",
  			contentType: "text/xml",
  		  success: function(recvd, status) {
  			  log(recvd, '+Recvd+');
  			  if (!self.checkForFailure(recvd, self)) return false;
  				if (onSuccess) onSuccess(recvd, self);
  			},
        error: function(recvd, status) {
          onFailure(recvd);
        }
  		});
    }
  };

  window.tagBuilder = function(name, attrs, contents) {
    if (attrs) {
      if (attrs.constructor == String || attrs.constructor == Array) {
        contents = attrs;
        attrs = {};
      }
    } else {
      attrs = {};
      contents = null;
    }

    var tagArgs = [name, attrs, contents];
    return buildTag.apply(null, tagArgs)
  };

  window.Session = function (url, username, password, domain) {
    var domain = domain || 'localhost';
    var session = new Private(this, url, username, password, domain);

    this.username = function() { return username; };
    this.settings = function() { return settings };
    this.url = function() { return session.url };
    this.rid = function() { return session.rid };
    this.jid = function() { return session.jid };
    this.domain = function() { return session.domain };
    this.error = function() { return session.error };
    this.roster = function() { return session.roster.items };
    this.connected = function() { return session.connected };
    this.queues = function() { return session.queues };
    this.callbacks = function() { return session.callbacks };

    this.open = function() { session.open() };
    this.close = function() { session.close() };
    this.sendMessage = function(recipient, message) { session.sendMessage(recipient, message) };
    this.requestSubscription = function(recipient) { session.requestSubscription(recipient) };
    this.approveSubscription = function(recipient) { session.approveSubscription(recipient) };    

    this.setup = function(newSettings) { $.extend(settings, newSettings) };
  };
})(jQuery);

a = ['iq', {foo: 'bar'}]
b = [ "iq", { foo: 'bar' }, [ [ 'bind', { x: 'y' } ]]]
c = ['iq', 'data']
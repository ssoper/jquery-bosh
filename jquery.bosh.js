jQuery.bosh = jQuery.extend({

	setup: function( settings ) {
		jQuery.extend( jQuery.bosh.settings, settings )
	},
	
	settings: {
		protocol: 'http://jabber.org/protocol/httpbind',
		xmlns: 'urn:ietf:params:xml:ns:xmpp',
		resource: 'jquery-bosh',
		port: 5222,
		debug: true // * Change back to false on release *
	},

  errors: {
    not_authorized: 'Invalid login'
  },

	generateRid: function() {
		return Math.round(100000.5 + (((900000.49999) - (100000.5)) * Math.random()));
	},

	log: function( data, header ) {
		if (!jQuery.bosh.settings.debug) return true
		if (typeof console == 'undefined') return true
		try {
			if (header) console.log(header);
			if (typeof data.documentElement == 'undefined') 
				console.log(data);
			else
				console.log(jQuery.bosh.toText(data));
		} catch (exception) {
			console.log(exception);
		}
	},

	tagBuilder: function( tag, attrs, data ) {
		var req = "<" + tag;
		
		if (typeof attrs == 'string') {
			data = attrs;
		}
		
		if (typeof attrs == 'object') {
			jQuery.each(attrs, function(k, v) {
				k = k.replace(/_/, ':');
				req += " " + k + "='" + v + "'";
			});
	  }
		
		if (typeof data == 'undefined')
			req += "/>";
		else
			req += ">" + data + "</" + tag + ">";
			
		return req;
	},

	toText: function( xmlResponse ) {
		if (xmlResponse == null) return false;
		if (typeof xmlResponse.xml != 'undefined') return xmlResponse.xml;
		try {
			if (typeof XMLSerializer == 'function') return (new XMLSerializer()).serializeToString(xmlResponse);
		} catch (exception) {
			jQuery.bosh.log(exception, 'Error when attempting XML serialization');
		}
		return false;
	},

  logMessages: function( messages ) {
    jQuery(messages).each(function(k, v) { 
      jQuery.bosh.log('Message ' + k);
      jQuery.bosh.log(v.from, 'From');
      ts = v.timestamp || 'none supplied';
      jQuery.bosh.log(ts, 'Timestamp');
      jQuery.bosh.log(v.message, 'Message');
    });
  },

	Message: function( packet ) {
		this.from = null;
		this.message = null;
		this.timestamp = null;
    this.raw = packet;

		if (!packet) return;

		if (packet.getAttribute('from') && packet.getAttribute('from').split("@").length > 1)
			this.from = packet.getAttribute('from').split("@")[0];

		if (jQuery('body', packet).length > 0)
      this.message = jQuery.trim(jQuery('body', packet).text());

		if (jQuery('x[stamp]', packet).length > 0) {
			ts = jQuery('x[stamp]', packet).attr('stamp');
			this.timestamp = new Date();
			this.timestamp.setUTCFullYear(Number(ts.substr(0, 4)));
			this.timestamp.setUTCMonth(Number(ts.substr(4, 2)) - 1); // Javscript months are 0-11
			this.timestamp.setUTCDate(Number(ts.substr(6, 2)));
			this.timestamp.setUTCHours(Number(ts.substr(9, 2)));
			this.timestamp.setUTCMinutes(Number(ts.substr(12, 2)));
			this.timestamp.setUTCSeconds(Number(ts.substr(15, 2)));
		}
	},

  Presence: function( packet ) {
    this.jid = packet.getAttribute('jid') || packet.getAttribute('from');
    this.jid = this.jid.split('/')[0];  // JID sometimes contains Jabber client 'user@domain/client'
    this.name = this.jid.split('@')[0];
    this.available = packet.getAttribute('type') == 'unavailable' ? false : true;
  },

  Roster: function() {
    this.items = [];
    
    this.find = function( presence ) {
      var result = null;
      jQuery(this.items).each(function(k, v) {
        if (presence.jid == v.jid) result = k;
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
  },

  Error: function(type, message) {
    this.type = type;
    this.message = message;
  },

  checkForFailure: function( session, packet ) {
    if (!packet) return false;
    
    if (jQuery('failure', packet).length > 0) {
      error = $('failure', packet)[0].firstChild.tagName.replace("-", "_");
      jQuery(jQuery.bosh.errors).each(function(k, v) {
        if (v[error]) session.error = new jQuery.bosh.Error(error, v[error])
      });
      
      // Error received did not match any in errors hash
      if (!session.error) session.error = new jQuery.bosh.Error('unknown', error)

      // Login has not been compeleted and a failure callback exists 
      if (!session.connected && session.callbacks.login.failure) session.callbacks.login.failure();

      return false;
    }

    return true;
  },
  
	send: function( session, data, cbSuccess, cbFailure ) {
    if (!jQuery.isFunction(cbFailure)) {
      cbFailure = jQuery.bosh.handleFailure;
    }

  	jQuery.bosh.log(data, '-Sent-');

	  jQuery.ajax({
		  type: "POST",
		  url: session.url,
		  data: data,
		  success: function(recvd, status) {
			  session.lastResponse = recvd;
			  jQuery.bosh.log(recvd, '+Recvd+');
			  if (!jQuery.bosh.checkForFailure(session, recvd)) return false;
				if (cbSuccess) cbSuccess(session, recvd);
			},
      error: function(recvd, status) {
        session.lastResponse = recvd;
        cbFailure(session, recvd);
      },
			dataType: "xml",
			contentType: "text/xml"
		});
	},

  handleFailure: function( session, response ) {
    // jQuery.bosh.log(status, 'HTTP Code');
    jQuery.bosh.log(response, 'Error');
  },

	Session: function( url, username, password, domain ) {
		this.url = ( url.match(/^https?:\/\//) == null ? 'http://' + url : url );
		this.domain = domain || 'localhost';
		this.route = 'xmpp:' + this.domain + ':' + jQuery.bosh.settings.port;
		this.username = username;
		this.password = password;

		this.rid = jQuery.bosh.generateRid();
		this.lastResponse = null;
		this.connected = false;
		this.error = null;
    this.roster = new jQuery.bosh.Roster;
      
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

		this.incrementRid = function() {
			this.rid += 1;
			return this.rid;
		};

		this.ingestMessages = function( self, data ) {
			self.queues.messages = [];
			jQuery('message', data).each(function(k, v) { 
				self.queues.messages.push(new jQuery.bosh.Message(v));
			});

      if (self.callbacks.message.received) self.callbacks.message.received(self.queues.messages);
		};

    this.ingestPresences = function( self, data ) {
      jQuery('presence', data).each(function(k, v) {
        var username = v.getAttribute('from').split('@')[0]
        if (username != self.username) self.roster.push(new jQuery.bosh.Presence(v));
      });
      
      if (self.callbacks.roster.updated) self.callbacks.roster.updated();
    };

    this.ingestSubscriptionRequests = function( self, data ) {
      self.queues.subscription.requests = [];
      jQuery('presence[type="subscribe"]', data).each(function(k, v) {
        self.queues.subscription.requests.push(new jQuery.bosh.Presence(v));
      });

      if (self.callbacks.subscription.request) self.callbacks.subscription.request(self.queues.subscription.requests);
    };

    this.ingestSubscriptionConfirmations = function( self, data ) {
      self.queues.subscription.confirmations = [];
      jQuery('presence[type="subscribed"]', data).each(function(k, v) {
        self.queues.subscription.confirmations.push(new jQuery.bosh.Presence(v));
      });

      if (self.callbacks.subscription.confirmation) self.callbacks.subscription.confirmation(self.queues.subscription.confirmations);
    };

    this.listen = function() {
      jQuery.bosh.send(this, this.body({}), this.packetReceived);
    };

    this.packetReceived = function( self, response ) {
      if (jQuery('message', response).length > 0)
        self.ingestMessages(self, response);
      else if (jQuery('presence[type="subscribe"]', response).length > 0)
        self.ingestSubscriptionRequests(self, response);
      else if (jQuery('presence[type="subscribed"]', response).length > 0)
        self.ingestSubscriptionConfirmations(self, response);
      else if (jQuery('presence', response).length > 0)
        self.ingestPresences(self, response);

      self.listen();
    };

		this.open = function() {
			if (this.connected) return true;

			var attributes = {
				hold: 1, 
				wait: 298, 
				secure: false,
				ver: '1.6',
				xmpp_xmlns: 'urn:xmpp:xbosh',
				xmpp_version: '1.0'
			};
		
			attributes = jQuery.extend(attributes, { to: this.domain, route: this.route, rid: this.rid, xmlns: jQuery.bosh.settings.protocol });
			jQuery.bosh.send(this, jQuery.bosh.tagBuilder('body', attributes), this.login);
		};

		this.login = function( self, response ) {
			jQuery.each(['sid', 'wait', 'ver', 'inactivity', 'requests'], function(k, v) {
				self[v] = response.documentElement.getAttribute(v);
			});

			var auth = jQuery.base64Encode(self.username + '@' + self.domain + String.fromCharCode(0) + self.username + String.fromCharCode(0) + self.password);
			var xmlns = jQuery.bosh.settings.xmlns + "-sasl";
      var packet = self.body({}, jQuery.bosh.tagBuilder('auth', { xmlns: xmlns, mechanism: 'PLAIN' }, auth))
			jQuery.bosh.send(self, packet, self.bindToStream);
		};

		this.bindToStream = function( self, response ) {
			var packet = self.body({ xmpp_restart: 'true' }, 
						         jQuery.bosh.tagBuilder('iq', { xmlns: 'jabber:client', to: self.domain, type: 'set', id: 'bind_1' }, 
							         jQuery.bosh.tagBuilder('bind', { xmlns: jQuery.bosh.settings.xmlns + "-bind" }, 
								         jQuery.bosh.tagBuilder('resource', jQuery.bosh.settings.resource))));
      jQuery.bosh.send(self, packet, self.startSession);
		};

		this.startSession = function( self, response ) {
			var packet = self.body({}, 
						         jQuery.bosh.tagBuilder('iq', { xmlns: 'jabber:client', to: self.domain, type: 'set', id: 'sess_1' },
						           jQuery.bosh.tagBuilder('session', { xmlns: jQuery.bosh.settings.xmlns + "-session" })));
      jQuery.bosh.send(self, packet, self.setPresence);
		};

		this.setPresence = function( self, response ) {
      var packet = self.body({},jQuery.bosh.tagBuilder('presence', { xmlns: 'jabber:client' }));
			jQuery.bosh.send(self, packet, self.completeLogin);
		};

    this.completeLogin = function( self, response ) {
			self.connected = true;
			self.ingestPresences(self, response);
			self.ingestMessages(self, response);
			self.fillRoster(self);
      self.listen();
    };

		this.close = function() {
			var packet = this.body({ type: 'terminate' }, 
									   jQuery.bosh.tagBuilder('presence', { type: 'unavailable', xmlns: 'jabber:client' }));
			
			jQuery.bosh.send(this, packet, this.completeLogout);
		};

    this.completeLogout = function( self, response ) {
			self.sid = null;
			self.rid = null;
			self.connected = false;
    };

		this.sendMessage = function( recipient, msg ) {
			if (!this.connected) return false;

			var jid = this.parseJid(recipient);
			var from = this.username + '@' + this.domain;
			var packet = this.body({}, 
								     jQuery.bosh.tagBuilder('message', { xmlns: 'jabber:client', to: jid, from: from },
								       jQuery.bosh.tagBuilder('body', msg)));

      jQuery.bosh.send(this, packet, this.ingestMessages);
		};
		
		this.requestSubscription = function( recipient ) {
			if (!this.connected) return false;

			var jid = this.parseJid(recipient);
			var packet = this.body({}, jQuery.bosh.tagBuilder('presence', { xmlns: 'jabber:client', to: jid, type: 'subscribe' }));
      jQuery.bosh.send(this, packet);
		};

		this.approveSubscription = function( recipient ) {
			if (!this.connected) return false;

			var jid = this.parseJid(recipient);
			var packet = this.body({}, jQuery.bosh.tagBuilder('presence', { xmlns: 'jabber:client', to: jid, type: 'subscribed' }));
      jQuery.bosh.send(this, packet);
		};

    this.parseJid = function( recipient ) {
      return (recipient.split('@').length > 1) ? recipient : recipient + '@' + this.domain;
    };

		this.fillRoster = function( self ) {
			if (!self.connected) return false;

			var from = this.username + '@' + this.domain;
			var packet = this.body({}, 
                     jQuery.bosh.tagBuilder('iq', { xmlns: 'jabber:client', from: from, type: 'get', id: 'roster_1' },
                       jQuery.bosh.tagBuilder('query', { xmlns: 'jabber:iq:roster' })));

      jQuery.bosh.send(this, packet, function( self, data ) {
        jQuery('query > item[subscription!="none"]', data).each(function(k, v) {
          var presence = new jQuery.bosh.Presence(v);
          presence.available = false;
          if (self.roster.find(presence) == null) self.roster.push(presence);
        });

        // Login has succeeded and a success callback exists
  			if (self.callbacks.login.success) self.callbacks.login.success();
      });
		};

		this.body = function( attrs, data ) {
			attrs = jQuery.extend(attrs, { rid: this.incrementRid(), sid: this.sid, xmlns: jQuery.bosh.settings.protocol });
			return jQuery.bosh.tagBuilder('body', attrs, data);
		};
	}

});

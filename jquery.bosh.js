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

	send: function( session, data, success_cb, failure_cb ) {
    if (!jQuery.isFunction(failure_cb)) {
      failure_cb = jQuery.bosh.handleFailure;
    }

  	jQuery.bosh.log(data, '-Sent-');

	  jQuery.ajax({
		  type: "POST",
		  url: session.url,
		  data: data,
		  success: function(recvd, status) {
			  session.lastResponse = recvd;
			  jQuery.bosh.log(recvd, '+Recvd+');
				if (success_cb) success_cb(session, recvd);
			},
      error: function(recvd, status) {
        session.lastResponse = recvd;
        if (failure_cb) failure_cb(recvd, status);
      },
			dataType: "xml",
			contentType: "text/xml"
		});
	},

  handleFailure: function( response, status ) {
    jQuery.bosh.log(status, 'HTTP Code');
    jQuery.bosh.log(response, 'Error');
  },

	Session: function( url, username, password, domain, cbMsgRecvd ) {
		this.url = ( url.match(/^https?:\/\//) == null ? 'http://' + url : url );
		this.domain = domain || 'localhost';
		this.route = 'xmpp:' + this.domain + ':' + jQuery.bosh.settings.port;
		this.username = username;
		this.password = password;

		this.rid = jQuery.bosh.generateRid();
		this.lastResponse = null;
		this.connected = false;
		this.messageQueue = [];
    this.cbMsgRecvd = cbMsgRecvd || jQuery.bosh.logMessages;

		this.incrementRid = function() {
			this.rid += 1;
			return this.rid;
		};

		this.ingestMessages = function( self, data ) {
			self = ( self ? self : this );
			self.messageQueue = [];
			jQuery('message', data).each(function(k, v) { 
				self.messageQueue.push(new jQuery.bosh.Message(v));
			});
		};

    this.listen = function() {
      jQuery.bosh.send(this, this.body({}), this.messageReceived);
    };

    this.messageReceived = function( self, response ) {
      self.ingestMessages(self, response);
      self.cbMsgRecvd(self.messageQueue);
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
			self.ingestMessages(self, response);
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

			var to = recipient + '@' + this.domain;
			var from = this.username + '@' + this.domain;
			var packet = this.body({}, 
								     jQuery.bosh.tagBuilder('message', { xmlns: 'jabber:client', to: to, from: from },
								       jQuery.bosh.tagBuilder('body', msg)));

      jQuery.bosh.send(this, packet, this.ingestMessages);
		};
		
		this.body = function( attrs, data ) {
			attrs = jQuery.extend(attrs, { rid: this.incrementRid(), sid: this.sid, xmlns: jQuery.bosh.settings.protocol });
			return jQuery.bosh.tagBuilder('body', attrs, data);
		};
	}

});

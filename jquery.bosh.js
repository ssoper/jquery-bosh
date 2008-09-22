jQuery.bosh = jQuery.extend({

	post: function( session, data, callback ) {
		if ( jQuery.isFunction( data ) ) {
			callback = data;
			data = {};
		}

		jQuery.bosh.log(data, '-Sent-');

		return jQuery.ajax({
			type: "POST",
			url: session.url,
			data: data,
			success: function(recvd, status) {
				session.lastResponse = recvd;
				jQuery.bosh.log(recvd, '+Recvd+');
				if (callback) callback(recvd, status);
			},
			dataType: "xml",
			contentType: "text/xml"
		});
	},

	setup: function( settings ) {
		jQuery.extend( jQuery.bosh.settings, settings )
	},
	
	settings: {
		protocol: 'http://jabber.org/protocol/httpbind',
		xmlns: 'urn:ietf:params:xml:ns:xmpp',
		resource: 'jquery-bosh',
		port: 5222,
		polling: false,
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
				console.log(data.documentElement);
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

	Session: function( url, username, password, to ) {
		this.url = ( url.match(/^https?:\/\//) == null ? 'http://' + url : url );
		this.to = ( to ? to : 'localhost' );
		this.route = 'xmpp:' + this.to + ':' + jQuery.bosh.settings.port;
		this.username = username;
		this.password = password;

		this.rid = jQuery.bosh.generateRid();
		this.lastResponse = null;
		this.connected = false;

		this.incrementRid = function() {
			this.rid += 1;
			return this.rid;
		};

		this.lastResponseText = function() {
			if (this.lastResponse == null) return false;
			if (this.lastResponse.xml) return this.lastResponse.xml;
			if (typeof XMLSerializer == "function") return (new XMLSerializer()).serializeToString(this.lastResponse);
			return false;
		};

		this.open = function() {
			if (this.connected) return false;

			var self = this;
			
			jQuery.bosh.post(self, self.requestSID(), function(data, status) {
				jQuery.each(['sid', 'wait', 'ver', 'inactivity', 'requests', 'polling'], function(k, v) {
					self[v] = data.documentElement.getAttribute(v);
				});

				jQuery.bosh.post(self, self.login(), function(data, status) {
					jQuery.bosh.post(self, self.bindToStream(), function(data, status) {
						jQuery.bosh.post(self, self.startSession(), function(data, status) {
							jQuery.bosh.post(self, self.setPresence(), function(data, status) {
								self.connected = true;
							});
						});
					});
				});
			});
		};

		this.close = function() {
			var self = this;
			var packet = this.body({ type: 'terminate'}, 
									   jQuery.bosh.tagBuilder('presence', { type: 'unavailable', xmlns: 'jabber:client' }));
			
			jQuery.bosh.post(self, packet, function(data, status) {
				self.sid = null;
				self.rid = null;
				self.connected = false;
			});
		};

		this.sendMessage = function( recipient, msg ) {
			if (!this.connected) return false;

			var to = recipient + '@' + this.to;
			var from = this.username + '@' + this.to;
			var packet = this.body({}, 
								     jQuery.bosh.tagBuilder('message', { xmlns: 'jabber:client', to: to, from: from },
								       jQuery.bosh.tagBuilder('body', msg)));

			jQuery.bosh.post(this, packet);
		};
		
		this.poll = function() {
			jQuery.bosh.post(this, this.body({}), function(data, status) {
				log(data.documentElement)
			});
		}
		
		this.body = function( attrs, data ) {
			attrs = jQuery.extend(attrs, { rid: this.incrementRid(), sid: this.sid, xmlns: jQuery.bosh.settings.protocol });
			return jQuery.bosh.tagBuilder('body', attrs, data);
		};
		
		this.setPresence = function() {
			return this.body({}, jQuery.bosh.tagBuilder('presence', { xmlns: 'jabber:client' }));
		};
		
		this.startSession = function() {
			return this.body({}, 
						   jQuery.bosh.tagBuilder('iq', { xmlns: 'jabber:client', to: this.to, type: 'set', id: 'sess_1' },
						     jQuery.bosh.tagBuilder('session', { xmlns: jQuery.bosh.settings.xmlns + "-session" })));
		};
		
		this.bindToStream = function() {
			return this.body({ xmpp_restart: 'true' }, 
						   jQuery.bosh.tagBuilder('iq', { xmlns: 'jabber:client', to: this.to, type: 'set', id: 'bind_1' }, 
							   jQuery.bosh.tagBuilder('bind', { xmlns: jQuery.bosh.settings.xmlns + "-bind" }, 
								   jQuery.bosh.tagBuilder('resource', jQuery.bosh.settings.resource))));
		};
		
		this.login = function() {
			var auth = jQuery.base64Encode(this.username + '@' + this.to + String.fromCharCode(0) + this.username + String.fromCharCode(0) + this.password);
			var xmlns = jQuery.bosh.settings.xmlns + "-sasl";
			return this.body({}, jQuery.bosh.tagBuilder('auth', { xmlns: xmlns, mechanism: 'PLAIN' }, auth));
		};
		
		this.requestSID = function() {
			var attributes = {
				hold: 1, 
				wait: 300, 
				secure: false,
				ver: '1.6',
				xmpp_xmlns: 'urn:xmpp:xbosh',
				xmpp_version: '1.0'
			};

			// Check for polling
			if (jQuery.bosh.settings.polling) { attributes = jQuery.extend(attributes, { hold: 0, wait: 0 }) };
		
			attributes = jQuery.extend(attributes, { to: this.to, route: this.route, rid: this.rid, xmlns: jQuery.bosh.settings.protocol });
			return jQuery.bosh.tagBuilder('body', attributes);
		};
	}

});

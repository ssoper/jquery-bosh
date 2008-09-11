jQuery.bosh = jQuery.extend({

	post: function( url, data, callback, type ) {
		if ( jQuery.isFunction( data ) ) {
			callback = data;
			data = {};
		}

		return jQuery.ajax({
			type: "POST",
			url: url,
			data: data,
			success: callback,
			dataType: "xml",
			contentType: "text/xml"
		});
	},

	boshSetup: function( settings ) {
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

	logTransaction: function( sent, received ) {
		if (!jQuery.bosh.settings.debug) return true
		if (typeof console == 'undefined') return true
		try {
			console.log('');
			console.log('-Sent-');
			console.log(sent);
			console.log('+Recvd+');
			console.log(received.documentElement);
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
		this.sid = null;
		this.rid = jQuery.bosh.generateRid();
		this.wait = null;
		this.ver = null;
		this.inactivity = null;
		this.requests = null;
		this.hold = null;
		this.lastResponse = null;
		this.route = 'xmpp:' + this.to + ':' + jQuery.bosh.settings.port;
		this.connected = false;

		this.username = username;
		this.password = password;

		this.incrementRid = function() {
			this.rid += 1;
			return this.rid;
		};
	
		this.open = function() {
			if (this.connected) return false;
					
			var self = this;
			var packet = this.requestSID();
			
			jQuery.bosh.post(self.url, packet, function(data, status) {		
				self.lastResponse = data.documentElement;
				self.sid = data.documentElement.getAttribute('sid');
				self.wait = data.documentElement.getAttribute('wait');
				self.ver = data.documentElement.getAttribute('ver');
				self.inactivity = data.documentElement.getAttribute('inactivity');
				self.requests = data.documentElement.getAttribute('requests');
				self.hold = data.documentElement.getAttribute('hold');
				jQuery.bosh.logTransaction(packet, data);
				packet1 = self.login();

				jQuery.bosh.post(self.url, packet1, function(data, status) {
					self.lastResponse = data.documentElement;
					jQuery.bosh.logTransaction(packet1, data);
					var packet2 = self.bindToStream();

					jQuery.bosh.post(self.url, packet2, function(data, status) {
						self.lastResponse = data.documentElement;
						jQuery.bosh.logTransaction(packet2, data);
						var packet3 = self.startSession();
			
						jQuery.bosh.post(self.url, packet3, function(data, status) {
							self.lastResponse = data.documentElement;
							jQuery.bosh.logTransaction(packet3, data);
							var packet4 = self.setPresence();
			
							jQuery.bosh.post(self.url, packet4, function(data, status) {
								self.lastResponse = data.documentElement;
								jQuery.bosh.logTransaction(packet4, data);
								self.connected = true;
							});
						});
					});
				});
			});
		};

		this.close = function() {
			this.sid = null;
			this.lastResponse = null;
			this.connected = false;
		};

		this.sendMessage = function( recipient, msg ) {
			if (!this.connected) return false;

			var to = recipient + '@' + this.to;
			var from = this.username + '@' + this.to;
			var packet = this.body({}, 
								     jQuery.bosh.tagBuilder('message', { xmlns: 'jabber:client', to: to, from: from },
								       jQuery.bosh.tagBuilder('body', msg)));
			var self = this;

			jQuery.bosh.post(this.url, packet, function(data, status) {
				self.lastResponse = data.documentElement;
				console.log(data.documentElement)
			});
		};
		
		this.body = function( attrs, data ) {
			attrs = jQuery.extend(attrs, { rid: this.incrementRid(), sid: this.sid, xmlns: jQuery.bosh.settings.protocol });
			return jQuery.bosh.tagBuilder('body', attrs, data)
		};
		
		this.setPresence = function() {
			return this.body({}, jQuery.bosh.tagBuilder('presence', { xmlns: 'jabber:client' }))
		}
		
		this.startSession = function() {
			return this.body({}, 
						   jQuery.bosh.tagBuilder('iq', { xmlns: 'jabber:client', to: this.to, type: 'set', id: 'sess_1' },
						     jQuery.bosh.tagBuilder('session', { xmlns: jQuery.bosh.settings.xmlns + "-session" })))
		}
		
		this.bindToStream = function() {
			return this.body({ xmpp_restart: 'true' }, 
						   jQuery.bosh.tagBuilder('iq', { xmlns: 'jabber:client', to: this.to, type: 'set', id: 'bind_1' }, 
							   jQuery.bosh.tagBuilder('bind', { xmlns: jQuery.bosh.settings.xmlns + "-bind" }, 
								   jQuery.bosh.tagBuilder('resource', jQuery.bosh.settings.resource))))
			
		};
		
		this.login = function() {
			var auth = jQuery.base64Encode(this.username + '@' + this.to + String.fromCharCode(0) + this.username + String.fromCharCode(0) + this.password);
			var xmlns = jQuery.bosh.settings.xmlns + "-sasl";
			return this.body({}, jQuery.bosh.tagBuilder('auth', { xmlns: xmlns, mechanism: 'PLAIN' }, auth))
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
		
			attributes = jQuery.extend(attributes, { to: this.to, route: this.route, rid: this.rid, xmlns: jQuery.bosh.settings.protocol });
			return jQuery.bosh.tagBuilder('body', attributes)
		};
	}

});

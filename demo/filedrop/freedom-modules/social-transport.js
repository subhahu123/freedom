function SocialTransport(socialProviders, transportProviders) {
  this.social = socialProviders[0];
  this.transportProvider = transportProviders[0];
  this.ERRCODE = this.social.ERRCODE;
  this.STATUS = this.social.STATUS;
  this.freedomCore = freedom.core();

  this.users = {};
  this.clients = {};
  this.transportSignals = {};
  this.transports = {};
  this.messageListeners = [];
  
  this.social.on('onUserProfile', this._onUserProfile.bind(this));
  this.social.on('onClientState', this._onClientState.bind(this));
  this.social.on('onMessage', this._onMessage.bind(this));
}

SocialTransport.prototype.on = function(tag, cb) {
  if (tag == 'onMessage') {
    this.messageListeners.push(cb);
  } else {
    this.social.on(tag, cb);
  }
};
SocialTransport.prototype.login = function(loginOpts) {
  return this.social.login(loginOpts);
};
SocialTransport.prototype.clearCachedCredentials = function() {
  return this.social.clearCachedCredentials();
};
SocialTransport.prototype.getClients = function() {
  return this.social.getClients();
};
SocialTransport.prototype.getUsers = function() {
  return this.social.getUsers();
};
//Optional tag
SocialTransport.prototype.sendMessage = function(to, tag, msg) {
  if (!this.clients.hasOwnProperty(to)) {
    return this._createReject('SEND_INVALIDDESTINATION');
  } else if (this.clients[to].status == this.STATUS['OFFLINE']) {
    return this._createReject('OFFLINE');
  } else if (this.clients[to].status == this.STATUS['ONLINE_WITH_OTHER_APP']) {
    return this._toString(msg).then(function(toSend){
      return this.social.sendMessage(to, toSend);
    }, function() {
      return this._createReject('MALFORMEDPARAMETERS');
    });
  } 

  //Let's setup a freedom transport if it doesn't exist
  if (!this.transports.hasOwnProperty(to)) {
    this.transports[to] = this._createTransport(to);
  }

  if (typeof tag == 'undefined') {
    tag = 'data';
  }
  return this._toArrayBuffer(msg).then(function(toSend) {
    return this.transports[to].send(tag, toSend);
  }, function() {
    return this._createReject('MALFORMEDPARAMETERS');
  });
};
SocialTransport.prototype.logout = function() {
  return this.social.logout();
};


/**
 * INTERNAL METHODS
 **/
SocialTransport.prototype._createTransport = function(clientId) {
  var transport = this.transportProvider();
  transport.on('onData', this._onData.bind(this, clientId));
  transport.on('onData', this._onClose.bind(this, clientId));

  this.freedomCore.createChannel().then(function (clientId, chan) {
    chan.channel.on('message', function(clientId, msg) {
      this.social.sendMessage(clientId, msg);
    }.bind(this, clientId));
    this.transportSignals[clientId] = chan.channel;
    transport.setup(clientId, chan.identifier);
  }.bind(this, clientId));

  return transport;
};
SocialTransport.prototype._createReject = function (err) {
  return Promise.reject({
    errcode: err,
    message: this.ERRCODE[err]
  });
};
SocialTransport.prototype._toArrayBuffer = function(val) {
  if (val.constructor == ArrayBuffer) {
    return Promise.resolve(val);
  } else if (typeof val == 'string') {
    return Promise.resolve(this._str2ab(val));
  } else {
    console.error('SocialTransport._toArrayBuffer(' + val + ') has unknown type: ' + (typeof val));
    return Promise.reject();
  }
};
SocialTransport.prototype._toString = function(val) {
  if (typeof val == 'string') {
    return Promise.resolve(val);
  } else if (val.constructor == ArrayBuffer) {
    return Promise.resolve(this._ab2str(val));
  } else {
    console.error('SocialTransport._toString(' + val + ') has unknown type: ' + (typeof val));
    return Promise.reject();
  }
};
SocialTransport.prototype._ab2str = function (buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
};
SocialTransport.prototype._str2ab = function(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};

// Registered with social provider
SocialTransport.prototype._onUserProfile = function(val) {
  this.users[val.userId] = val;
};
SocialTransport.prototype._onClientState = function(val) {
  this.clients[val.clientId] = val;
};
SocialTransport.prototype._onMessage = function(val) {
  var clientId = val.from.clientId;
  var message = val.message;
  this.clients[clientId] = val.from;
  if (!this.transportSignals.hasOwnProperty(clientId)) {
    this.transportSignals[clientId] = this._createTransport(clientId);
  }
  this.transportSignals[clientId].emit('message', message);
};

// Registered with transport provider
SocialTransport.prototype._onData = function(clientId, val) {
  var ret = {
    from: this.clients[clientId],
    message: val
  };
  for (var i=0; i<this.messageListeners.length; i++) {
    this.messageListeners[i](ret);
  }
};
SocialTransport.prototype._onClose = function(clientId) {
  if (this.transports.hasOwnProperty(clientId)) {
    delete this.transports[clientId];
  }
  if (this.transportSignals.hasOwnProperty(clientId)) {
    delete this.transportSignals[clientId];
  }
};

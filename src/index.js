'use strict'

const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')
const Multiplex = require('libp2p-mplex')
const SECIO = require('libp2p-secio')
const Libp2p = require('libp2p')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const series = require('async/series')

const {Discovery, Server} = require('libp2p-rendezvous')

const envId = process.env['ENV_ID']
const Id = require(`./conf/${envId || 'monkey'}.json`)

class Node extends Libp2p {
  constructor(peerInfo, peerBook, options) {
    options = options || {}

    const modules = {
      transport: [
        new TCP(), 
        new WS()
      ],
      connection: {
        muxer: [Multiplex],
        crypto: [SECIO]
      }
    }

    if (options.modules && options.modules.transport) {
      options.modules.transport.forEach((t) => modules.transport.push(t))
    }

    if (options.modules && options.modules.discovery) {
      options.modules.discovery.forEach((d) => modules.discovery.push(d))
    }

    super(modules, peerInfo, peerBook, options)
    this._rndzvServer = new Server({swarm: this})
    this._rndvzDiscovery = new Discovery(this)
    this._rndvzDiscovery.on('peer', (peerInfo) => this.emit('peer:discovery', peerInfo))
  }

  start (callback) {
    series([
      (cb) => super.start(cb),
      (cb) => this._rndzvServer.start(cb),
      (cb) => this._rndvzDiscovery.start(cb)
    ], callback)
  }

  stop(callback) {
    series([
      (cb) => this._rndzvServer.stop(cb),
      (cb) => this._rndvzDiscovery.stop(cb),
      (cb) => super.stop(cb)
    ], callback)
  }
}

PeerId.createFromJSON(Id, (err, peerId) => {
  if (err) {
    console.error(`An error occurred!`, err)
    throw new Error(err)
  }

  const peer = new PeerInfo(peerId)
  peer.multiaddrs.add('/ip4/0.0.0.0/tcp/30333')
  peer.multiaddrs.add('/ip4/0.0.0.0/tcp/30334/ws')
  const swarm = new Node(peer, null, {
    relay: {
      enabled: true,
      hop: {
        enabled: true
      }
    }
  })
  swarm.start(err => {
    if (err) {
      console.error(`An error occurred!`, err)
      throw new Error(err)
    }

    console.log('Rendezvous started')
    peer.multiaddrs.forEach((a) => console.log(`listening on addr: ${a.toString()}`))
  })
})

'use strict'

const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')
const Multiplex = require('libp2p-mplex')
const SECIO = require('libp2p-secio')
const Libp2p = require('libp2p')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const series = require('async/series')
// const posix = require('posix')
const defaultsDeep = require('@nodeutils/defaults-deep')

const { Discovery, Server } = require('libp2p-rendezvous')

const envId = process.env['ENV_ID']
const Id = require(`./conf/${envId || 'monkey'}.json`)

// raise maximum number of open file descriptors to 10k,
// hard limit is left unchanged
// posix.setrlimit('nofile', { soft: 10000 })

const wsPort = process.env['WS_PORT']
const tcpPort = process.env['TCP_PORT']
const isRndvz = process.env['IS_RNDVZ'] || false
const isCircuit = process.env['IS_CIRCUIT'] || false

class Node extends Libp2p {
  constructor (peerInfo, options) {
    const rndvzDiscovery = new Discovery()

    const defaults = {
      peerInfo,
      modules: {
        transport: [
          WS,
          TCP
        ],
        streamMuxer: [
          Multiplex
        ],
        connEncryption: [
          SECIO
        ],
        peerDiscovery: [
        ]
      },
      config: {
      }
    }

    if (isRndvz) {
      defaults.modules.peerDiscovery.push(rndvzDiscovery)
    }

    super(defaultsDeep(options, defaults))
    rndvzDiscovery.init(this)
    this._rndvzDiscovery = rndvzDiscovery
    this._rndzvServer = new Server({ swarm: this })
    this._rndvzDiscovery.on('peer', (peerInfo) => this.emit('peer:discovery', peerInfo))
  }

  start (callback) {
    series([
      (cb) => super.start(cb),
      (cb) => isRndvz ? this._rndzvServer.start(cb) : cb()
    ], callback)
  }

  stop (callback) {
    series([
      (cb) => isRndvz ? this._rndzvServer.stop(cb) : cb(),
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
  peer.multiaddrs.add(`/ip4/0.0.0.0/tcp/${tcpPort || 30333}`)
  peer.multiaddrs.add(`/ip4/0.0.0.0/tcp/${wsPort || 30334}/ws`)

  const config = {}
  if (isCircuit) {
    config['relay'] = {
      enabled: true,
      hop: {
        enabled: true,
        active: false
      }
    }
  }
  const swarm = new Node(peer, {
    config,
    connectionManager: {
      maxPeers: 10000
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

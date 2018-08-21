'use strict'

const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')
const Multiplex = require('libp2p-mplex')
const SECIO = require('libp2p-secio')
const Libp2p = require('libp2p')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const defaultsDeep = require('@nodeutils/defaults-deep')
const crypto = require('crypto')
const generate = require('pull-generate')

const parallel = require('async/parallel')
const waterfall = require('async/waterfall')

const pull = require('pull-stream')

class Node extends Libp2p {
  constructor (peerInfo, options) {
    const defaults = {
      peerInfo,
      modules: {
        streamMuxer: [
          Multiplex
        ],
        connEncryption: [
          SECIO
        ]
      },
      config: {
        relay: {
          enabled: true,
          hop: {
            enabled: true
          }
        }
      }
    }

    super(defaultsDeep(options, defaults))
  }
}

const createNode = (addrs, options, callback) => {
  PeerId.create((err, peerId) => {
    if (err) {
      console.error(`An error occurred!`, err)
      return callback(new Error(err))
    }

    const peer = new PeerInfo(peerId)
    addrs.forEach(a => peer.multiaddrs.add(a))
    const node = new Node(peer, options)
    callback(null, node)
  })
}

parallel([
  (cb) => createNode([
    '/ip4/127.0.0.1/tcp/30333/ws',
    '/ip4/127.0.0.1/tcp/30334'
  ], {
    modules: {
      transport: [
        TCP,
        WS
      ]
    },
    config: {
      relay: {
        enabled: true,
        hop: {
          enabled: true
        }
      }
    }
  }, cb),
  (cb) => createNode(['/ip4/127.0.0.1/tcp/30335'], {
    modules: {
      transport: [
        TCP
      ]
    },
    config: {
      relay: {
        enabled: true,
        hop: {
          enabled: true
        }
      }
    }
  }, cb),
  (cb) => createNode(['/ip4/127.0.0.1/tcp/30336/ws'], {
    modules: {
      transport: [
        WS
      ]
    },
    config: {
      relay: {
        enabled: true,
        hop: {
          enabled: true
        }
      }
    }
  }, cb)
], (err, nodes) => {
  if (err) {
    throw err
  }

  const relay = nodes[0]
  const nodeA = nodes[1]
  const nodeB = nodes[2]

  parallel(nodes.map((n) => (cb) => n.start(cb)),
    (err) => {
      if (err) { throw err }

      waterfall([
        (cb) => nodeA.dial(relay.peerInfo, cb),
        (cb) => nodeB.dial(relay.peerInfo, cb),
        (cb) => setTimeout(cb, 2000)
      ], (err) => {
        if (err) { throw err }

        nodeB.handle('/test/circuit/1.0.0', (_, conn) => {
          pull(
            generate(0, (state, cb) => cb(state < 100000 / 1.4 ? null : true,
              crypto.randomBytes(4096),
              state + 1)),
            // pull.through((data) => console.log(data)),
            conn
          )
        })

        nodeA.dialProtocol(nodeB.peerInfo, '/test/circuit/1.0.0', (err, conn) => {
          if (err) { throw err }
          let count = 0
          pull(
            conn,
            pull.through((data) => console.log(count++)),
            pull.drain(
              (data) => { },
              () => process.exit(0)
            )
          )
        })
      })
    })
})

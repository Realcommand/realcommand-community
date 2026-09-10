import {parentPort} from 'node:worker_threads'
globalThis.self={postMessage:(data,options)=>parentPort.postMessage(data,options.transfer)}
await import('../../client/poly/landscape-worker.ts')
parentPort.on('message',data=>self.onmessage({data}))

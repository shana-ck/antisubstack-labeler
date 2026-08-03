import express from 'express';
import { Registry, collectDefaultMetrics, Gauge, Counter } from 'prom-client';
import { writeHeapSnapshot} from 'node:v8';
import logger from './logger.ts';

const register = new Registry();
collectDefaultMetrics({ register });
register.setDefaultLabels({ app: "labeler", });
const app = express();

export const behind = new Gauge({ 
  name: 'requests_behind',
  help: 'Number of requests behind'
});

export const restarts = new Counter({
name: 'jetstream_restarts',
help: 'Number of times Jetstream has restarted'
});

export const drainReq = new Counter({
	name: 'drain',
	help: 'Number of times called drain'
})
export const inflightReq = new Gauge({
  name: 'inflight',
  help: 'Number of inflight requests'
})

register.registerMetric(behind);
register.registerMetric(restarts);
register.registerMetric(drainReq)
register.registerMetric(inflightReq)

app.get('/metrics', (req, res) => {
  register
    .metrics()
    .then(metrics => {
      res.set('Content-Type', register.contentType);
      res.send(metrics);
    })
    .catch((ex: unknown) => {
      logger.error(`Error serving metrics: ${(ex as Error).message}`);
      res.status(500).end((ex as Error).message);
    });
});

app.get('/heap', (req, res) => {
writeHeapSnapshot()
res.send({message: "heap snapshot saved"})
})

export const startMetricsServer = (port: number) => {
  return app.listen(port, () => {
    logger.info(`Metrics server is listening on ${port}`);
  });
};
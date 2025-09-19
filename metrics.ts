import express from 'express';
import { Registry, collectDefaultMetrics, Gauge } from 'prom-client';
import { writeHeapSnapshot} from 'node:v8';
import logger from './logger.js';

const register = new Registry();
collectDefaultMetrics({ register });
register.setDefaultLabels({ app: "labeler", });
const app = express();

export const behind = new Gauge({ 
  name: 'requests_behind',
  help: 'Number of requests behind'
});

register.registerMetric(behind);
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

export const startMetricsServer = (port: number, host = '127.0.0.1') => {
  return app.listen(port, host, () => {
    logger.info(`Metrics server is listening on ${host}:${port}`);
  });
};

/* global afterEach, describe, expect, it */
const http = require('node:http');
const { once } = require('node:events');
const WebSocket = require('ws');
import { attachRuntimeWebSocket } from './runtime-ws.ts';

describe('attachRuntimeWebSocket', () => {
  let server = null;

  afterEach(async () => {
    if (!server) {
      return;
    }
    await new Promise((resolve) => server.close(resolve));
    server = null;
  });

  it('accepts websocket upgrades and subscribes runtime listeners with session params', async () => {
    let subscribeCall = null;
    server = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });

    attachRuntimeWebSocket(server, {
      runtimeHub: {
        subscribe(ws, details) {
          subscribeCall = { ws, details };
        },
      },
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();

    const client = new WebSocket(`ws://127.0.0.1:${port}/api/runtime/ws?sessionUser=command-center&agentId=main`);
    await once(client, 'open');

    expect(subscribeCall).toBeTruthy();
    expect(subscribeCall.details).toEqual({
      sessionUser: 'command-center',
      agentId: 'main',
      overrides: {
        agentId: 'main',
      },
    });

    client.close();
    await once(client, 'close');
  });

  it('normalizes IM websocket subscriptions to the canonical native session key', async () => {
    let subscribeCall = null;
    server = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });

    attachRuntimeWebSocket(server, {
      runtimeHub: {
        subscribe(ws, details) {
          subscribeCall = { ws, details };
        },
      },
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();

    const client = new WebSocket(`ws://127.0.0.1:${port}/api/runtime/ws?sessionUser=%7B%22channel%22%3A%22dingtalk-connector%22%2C%22peerid%22%3A%22398058%22%7D&agentId=main`);
    await once(client, 'open');

    expect(subscribeCall?.details).toEqual({
      sessionUser: 'agent:main:dingtalk-connector:direct:398058',
      agentId: 'main',
      overrides: {
        agentId: 'main',
      },
    });

    client.close();
    await once(client, 'close');
  });
});

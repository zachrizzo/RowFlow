#!/bin/bash
export PG_PROFILE_SONDERMIND_DEV_HOST=127.0.0.1
export PG_PROFILE_SONDERMIND_DEV_PORT=5432
export PG_PROFILE_SONDERMIND_DEV_DATABASE=sonder_dev_fuse
export PG_PROFILE_SONDERMIND_DEV_USER=docker
export PG_PROFILE_SONDERMIND_DEV_PASSWORD=docker
export PG_PROFILE_SONDERMIND_DEV_SSL=false

echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pg.connection.list","arguments":{}}}' | node dist/index.js 2>&1 | grep -A 50 "result"

#!/bin/bash
set -e
cd /root/projects/alisio-pms
git fetch origin
git reset --hard origin/main
pkill -f 'next build' || true
sleep 2
rm -f /root/projects/alisio-pms/.next/lock
npm install
systemctl stop alisio-pms
NODE_OPTIONS='--max-old-space-size=2048' ./node_modules/.bin/next build 2>&1 | tail -10
systemctl start alisio-pms
sleep 3
systemctl status alisio-pms --no-pager | head -3
echo 'DEPLOY_OK'

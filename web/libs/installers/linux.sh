#!/bin/bash

git clone https://github.com/moeiscool/Shinobi.git Shinobi
cd Shinobi
echo 'Choose one:';
echo '----';
echo '- centos';
echo '- ubuntu';
read distribution
if [ ! -e "INSTALL/$distribution.sh" ]; then
    echo 'Installer not found.';
else
    chmod +x INSTALL/$distribution.sh
    INSTALL/$distribution.sh
    cp conf.sample.json conf.json
    pm2 start camera.js
    pm2 start cron.js
    ifconfig
fi
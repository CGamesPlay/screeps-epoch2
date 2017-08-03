# Epoch2

Second major iteration of my Screeps OS, this one built on screeps-regenerator.

This code currently sends a harvester to every source in claimed rooms and
harvests with prespawning. It does not send any haulers or do anything with the
harvested energy.

## Useful commands

**Deploy:**

    yarn run deploy

This will deploy to the same server that your screeps-multimeter is currently pointing at.

**Run the local automated tests:**

    yarn run test

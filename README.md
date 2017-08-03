# Epoch2

Second major iteration of my Screeps OS, this one built on screeps-regenerator.

This code currently sends a harvester to every source in claimed rooms and
harvests with prespawning. It does not send any haulers or do anything with the
harvested energy.

## OS features:

- Multithreading via generator functions.
- CPU throttling to prevent script timeouts.
- Process model with error isolation.
- 90%+ test coverage of the OS code.

### How does multithreading work?

A "task" in epoch2 is a generator function:

    function* main() {
      console.log(`Hello, it's ${Game.time}!`);
      for (let i = 99; i >= 0; i-- {
        console.log(`${i} bottles of beer on the wall...`);
        yield defer();
      }
      console.log(`Wow, that was a long song. Now it's ${Game.time}!`);
    }

This generator function runs each tick, and after each run its local variables
are saved into Memory and restored on the next tick. Underneath the hood, the
JavaScript source code is actually being re-written into a function which only
runs the part of the code since the last call to `yield`. This gives the
appearance that the function is running over multiple ticks. Yielding from a
task produces an **effect**, and there are a few different types:

- `defer()` - causes the task to be suspended until the next tick.
- `spawn(func, ...args) | spawn([context, func], ...args)` - starts a new task
  in the background and calls `func(...args)` or `context[func](...args)` in it.
- `join(task)` - wait for a previously spawned task to finish, then return the
  result or throw the error.
- `call(func, ...args) | call([context, func], ..args)` - this is similar to
  `join(yield spawn(...))` except that if the calling task is canceled, the
  called task will also be canceled (normally it will continue in the
  background).
- `all(...effects)` - wait until all of the effects passed in have finished,
  then return an array of the results in the same order. If any effect produces
  an error, immediately abort and throw the error. Instead of an array, you can
  also pass an object which will cause `all` to return an object with matching
  keys. This method is similar to `Promise.all`.
- `race(...effects)` - wait until any one of the effects passed in have finished,
  then return an array of the results in the same order. If any effect produces
  an error, immediately abort and throw the error. Instead of an array, you can
  also pass an object which will cause `race` to return an object with one key,
  which is the effect that finished. This method is similar to `Promise.race`.

## Useful commands

**Deploy:**

    yarn run deploy

This will deploy to the same server that your screeps-multimeter is currently pointing at.

**Run the local automated tests:**

    yarn run test

// how many imports are running right now.
// cpuMonitor checks this so an import isn't mistaken for high server load.
let active = 0;

module.exports = {
  start: () => {
    active += 1;
  },
  end: () => {
    active = Math.max(0, active - 1);
  },
  isBusy: () => active > 0,
};

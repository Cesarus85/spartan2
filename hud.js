// hud.js
export function createHUD(player, combat) {
  const hpEl = document.getElementById('hp');
  const ammoEl = document.getElementById('ammo');
  const reloadEl = document.getElementById('reloadHint');
  function update() {
    hpEl.textContent = `HP: ${player.getHealth()}`;
    ammoEl.textContent = `Ammo: ${combat.getAmmo()}/${combat.getMagSize()}`;
    reloadEl.textContent = combat.isReloading() ? 'Reloading...' : '';
  }
  return { update };
}

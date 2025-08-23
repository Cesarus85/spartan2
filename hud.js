// hud.js
export function createHUD(player, combat) {
  const hpEl = document.getElementById('hp');
  const ammoEl = document.getElementById('ammo');
  function update() {
    hpEl.textContent = `HP: ${player.getHealth()}`;
    ammoEl.textContent = `Ammo: ${combat.getAmmo()}`;
  }
  return { update };
}

// An in-page confirmation dialog that resolves true or false.

import { $, esc } from './dom.js';

export function confirmAction({ title, text, confirmLabel, danger = false }) {
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="confirm-title">${esc(title)}</h2></div>
    <div class="dialog-body"><p class="dialog-text">${esc(text)}</p></div>
    <div class="dialog-foot"><button class="btn" type="button" data-answer="no">Cancel</button><button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" type="button" data-answer="yes">${esc(confirmLabel)}</button></div>`;
  return new Promise((resolve) => {
    const done = (answer) => {
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(answer);
    };
    const onClick = (e) => {
      const b = e.target.closest('[data-answer]');
      if (b) done(b.dataset.answer === 'yes');
      else if (e.target === dialog) done(false);
    };
    const onClose = () => done(false);
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    dialog.querySelector('[data-answer="no"]').focus();
  });
}

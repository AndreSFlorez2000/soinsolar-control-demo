function setMessage(element, message = "", isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
  button.disabled = busy;
}

function showDialog(dialog) {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function clearRecoveryUrl() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("recovery");
  cleanUrl.searchParams.delete("code");
  cleanUrl.hash = "";
  window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
}

function authDialogMarkup() {
  return `
    <div id="passwordRecoveryPanel">
      <form id="passwordRecoveryForm" method="dialog" novalidate>
        <div class="dialog-heading">
          <div><p class="eyebrow">Seguridad de la cuenta</p><h3>Recuperar contraseña</h3></div>
          <button class="dialog-close" type="button" data-auth-close aria-label="Cerrar">×</button>
        </div>
        <p class="dialog-note">Enviaremos un enlace de verificación al correo institucional. El enlace permite definir una contraseña nueva sin revelar la anterior.</p>
        <div class="form-grid">
          <label class="span-2">Correo institucional *
            <input id="passwordRecoveryEmail" class="form-control" type="email" autocomplete="email" required />
          </label>
        </div>
        <p id="passwordRecoveryMessage" class="form-message" role="status" aria-live="polite"></p>
        <div class="dialog-actions">
          <button class="btn btn-outline-secondary" type="button" data-auth-close>Cancelar</button>
          <button id="sendPasswordRecoveryButton" class="btn btn-primary" type="submit">Enviar enlace seguro</button>
        </div>
      </form>
    </div>
    <div id="passwordUpdatePanel" hidden>
      <form id="passwordUpdateForm" method="dialog" novalidate>
        <div class="dialog-heading">
          <div><p class="eyebrow">Enlace verificado</p><h3>Crear contraseña nueva</h3></div>
          <button class="dialog-close" type="button" data-auth-close aria-label="Cerrar">×</button>
        </div>
        <p class="dialog-note">Usa al menos 8 caracteres. No compartas la contraseña ni la guardes en GitHub.</p>
        <div class="form-grid">
          <label class="span-2">Nueva contraseña *
            <input id="newPassword" class="form-control" type="password" minlength="8" maxlength="72" autocomplete="new-password" required />
          </label>
          <label class="span-2">Confirmar contraseña *
            <input id="confirmNewPassword" class="form-control" type="password" minlength="8" maxlength="72" autocomplete="new-password" required />
          </label>
        </div>
        <p id="passwordUpdateMessage" class="form-message" role="alert" aria-live="polite"></p>
        <div class="dialog-actions">
          <button class="btn btn-outline-secondary" type="button" data-auth-close>Cancelar</button>
          <button id="saveNewPasswordButton" class="btn btn-primary" type="submit">Guardar contraseña</button>
        </div>
      </form>
    </div>`;
}

export function installAuthSecurityUi({
  enabled,
  getCurrentSession,
  getCurrentUserEmail,
  onPasswordRecovery,
  requestPasswordReset,
  signOut,
  updatePassword
}) {
  if (document.querySelector("#passwordSecurityDialog")) return;

  const passwordInput = document.querySelector("#password");
  const logoutButton = document.querySelector("#logoutButton");
  if (!passwordInput || !logoutButton) return;

  const forgotButton = document.createElement("button");
  forgotButton.id = "forgotPasswordButton";
  forgotButton.className = "btn btn-link btn-sm px-0 mb-2";
  forgotButton.type = "button";
  forgotButton.textContent = "¿Olvidaste tu contraseña?";
  forgotButton.hidden = !enabled;
  passwordInput.insertAdjacentElement("afterend", forgotButton);

  const changeButton = document.createElement("button");
  changeButton.id = "changePasswordButton";
  changeButton.className = "btn btn-sm btn-outline-primary";
  changeButton.type = "button";
  changeButton.textContent = "Cambiar contraseña";
  changeButton.hidden = !enabled;
  logoutButton.insertAdjacentElement("beforebegin", changeButton);

  const dialog = document.createElement("dialog");
  dialog.id = "passwordSecurityDialog";
  dialog.className = "app-dialog app-dialog-small";
  dialog.innerHTML = authDialogMarkup();
  document.body.append(dialog);

  const recoveryPanel = dialog.querySelector("#passwordRecoveryPanel");
  const updatePanel = dialog.querySelector("#passwordUpdatePanel");
  const recoveryForm = dialog.querySelector("#passwordRecoveryForm");
  const updateForm = dialog.querySelector("#passwordUpdateForm");
  const recoveryEmail = dialog.querySelector("#passwordRecoveryEmail");
  const recoveryMessage = dialog.querySelector("#passwordRecoveryMessage");
  const updateMessage = dialog.querySelector("#passwordUpdateMessage");

  function openRecovery(email = "") {
    recoveryPanel.hidden = false;
    updatePanel.hidden = true;
    recoveryEmail.value = email;
    setMessage(recoveryMessage);
    showDialog(dialog);
    recoveryEmail.focus();
  }

  function openPasswordUpdate() {
    recoveryPanel.hidden = true;
    updatePanel.hidden = false;
    updateForm.reset();
    setMessage(updateMessage);
    showDialog(dialog);
    dialog.querySelector("#newPassword").focus();
  }

  forgotButton.addEventListener("click", () => {
    openRecovery(document.querySelector("#email")?.value.trim() ?? "");
  });

  changeButton.addEventListener("click", async () => {
    try {
      setBusy(changeButton, true, "Consultando…");
      openRecovery(await getCurrentUserEmail());
    } catch {
      window.alert("No fue posible identificar el correo de la sesión.");
    } finally {
      setBusy(changeButton, false);
    }
  });

  dialog.querySelectorAll("[data-auth-close]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(dialog));
  });

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sendButton = dialog.querySelector("#sendPasswordRecoveryButton");
    setMessage(recoveryMessage);
    setBusy(sendButton, true, "Enviando…");
    try {
      await requestPasswordReset(recoveryEmail.value);
      setMessage(recoveryMessage, "Si el correo está registrado, recibirás un enlace seguro. Revisa también la carpeta de spam.");
      sendButton.textContent = "Enlace solicitado";
      window.setTimeout(() => {
        sendButton.disabled = false;
        sendButton.textContent = "Enviar otro enlace";
      }, 60_000);
    } catch (error) {
      setMessage(recoveryMessage, error.message || "No fue posible solicitar el enlace.", true);
      setBusy(sendButton, false);
    }
  });

  updateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = dialog.querySelector("#newPassword").value;
    const confirmation = dialog.querySelector("#confirmNewPassword").value;
    const saveButton = dialog.querySelector("#saveNewPasswordButton");
    setMessage(updateMessage);
    if (newPassword !== confirmation) {
      setMessage(updateMessage, "Las contraseñas no coinciden.", true);
      return;
    }

    setBusy(saveButton, true, "Guardando…");
    try {
      await updatePassword(newPassword);
      await signOut();
      clearRecoveryUrl();
      closeDialog(dialog);
      setMessage(document.querySelector("#loginMessage"), "Contraseña actualizada. Ya puedes iniciar sesión.");
    } catch (error) {
      setMessage(updateMessage, error.message || "No fue posible actualizar la contraseña.", true);
    } finally {
      setBusy(saveButton, false);
    }
  });

  onPasswordRecovery(() => openPasswordUpdate());

  if (enabled && new URLSearchParams(window.location.search).get("recovery") === "1") {
    window.setTimeout(async () => {
      try {
        if (await getCurrentSession()) openPasswordUpdate();
      } catch {
        setMessage(document.querySelector("#loginMessage"), "El enlace expiró o ya fue utilizado. Solicita uno nuevo.", true);
      }
    }, 250);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const DEV_USER_KEY = "amc_developer_user";
  const SESSION_KEY = "amc_session_active";

  const form = document.getElementById("usuario-form");
  const codigoInput = document.getElementById("u-codigo");
  const claveInput = document.getElementById("u-clave");
  const msgDiv = document.getElementById("msg");
  const btnLogout = document.getElementById("btn-cerrar-sesion-perfil");

  // 1. Cargar y pre-rellenar datos actuales
  let currentDeveloper = null;
  try {
    const data = localStorage.getItem(DEV_USER_KEY);
    if (data) {
      currentDeveloper = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error al leer datos del desarrollador:", err);
  }

  if (!currentDeveloper) {
    currentDeveloper = {
      nombre: "PRINCIPAL DESARROLLADOR",
      codigo: "1110591592",
      clave: "Desa*2026",
    };
    localStorage.setItem(DEV_USER_KEY, JSON.stringify(currentDeveloper));
  }

  codigoInput.value = currentDeveloper.codigo;
  claveInput.value = currentDeveloper.clave;

  // 2. Lógica para Cerrar Sesión
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      window.location.replace("../login.html");
    });
  }

  // 3. Formulario - Guardar Cambios
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const codigoVal = codigoInput.value.trim();
    const claveVal = claveInput.value;

    // --- VALIDACIONES DE CÓDIGO DE USUARIO ---
    // Solo números
    if (!/^\d+$/.test(codigoVal)) {
      mostrarMensaje("El código de usuario debe contener únicamente números.", "error");
      codigoInput.focus();
      return;
    }
    // Longitud: mín 4, máx 10 dígitos
    if (codigoVal.length < 4 || codigoVal.length > 10) {
      mostrarMensaje("El código de usuario debe tener entre 4 y 10 dígitos.", "error");
      codigoInput.focus();
      return;
    }

    // --- VALIDACIONES DE CONTRASEÑA ---
    // Longitud: mín 5 caracteres
    if (claveVal.length < 5) {
      mostrarMensaje("La contraseña debe tener mínimo 5 caracteres.", "error");
      claveInput.focus();
      return;
    }
    // Debe contener al menos un número
    if (!/\d/.test(claveVal)) {
      mostrarMensaje("La contraseña debe incluir al menos un número.", "error");
      claveInput.focus();
      return;
    }
    // Debe contener al menos un carácter especial
    const regexEspecial = /[-*+?!@#$%^&()_={}[\]:;'"<>,.?\/~`|\\_+]/;
    if (!regexEspecial.test(claveVal)) {
      mostrarMensaje("La contraseña debe incluir al menos un carácter especial (ej: *, +, @, #).", "error");
      claveInput.focus();
      return;
    }

    // --- GUARDADO EXITOSO ---
    const updatedUser = {
      nombre: "PRINCIPAL DESARROLLADOR",
      codigo: codigoVal,
      clave: claveVal,
    };

    localStorage.setItem(DEV_USER_KEY, JSON.stringify(updatedUser));
    mostrarMensaje("¡Credenciales del desarrollador actualizadas con éxito!", "success");
  });

  function mostrarMensaje(texto, tipo) {
    msgDiv.innerHTML = "";
    const alertBox = document.createElement("div");
    alertBox.className = `alert alert-${tipo === "error" ? "error" : "success"}`;
    alertBox.textContent = texto;
    msgDiv.appendChild(alertBox);
    // Auto-scroll al mensaje
    msgDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const DEV_USER_KEY = "amc_developer_user";
  const SESSION_KEY = "amc_session_active";
  const IND_USERS_KEY = "amc_independent_users";

  // Obtener código de usuario activo
  let activeUserCode = sessionStorage.getItem("amc_active_user_code");
  if (!activeUserCode && sessionStorage.getItem(SESSION_KEY) === "true") {
    activeUserCode = "1110591592";
    sessionStorage.setItem("amc_active_user_code", activeUserCode);
  }
  const isDev = activeUserCode === "1110591592";

  // Elementos DOM
  const form = document.getElementById("usuario-form");
  const nombreInput = document.getElementById("u-nombre");
  const codigoInput = document.getElementById("u-codigo");
  const emailInput = document.getElementById("u-email");
  const claveInput = document.getElementById("u-clave");
  const msgDiv = document.getElementById("msg");
  const btnLogout = document.getElementById("btn-cerrar-sesion-perfil");

  // Elementos del módulo de usuarios independientes
  const cardIndependientes = document.getElementById("card-usuarios-independientes");
  const formCrearInd = document.getElementById("crear-usuario-form");
  const newCodigoInput = document.getElementById("new-u-codigo");
  const newEmailInput = document.getElementById("new-u-email");
  const newClaveInput = document.getElementById("new-u-clave");
  const tbodyIndependientes = document.getElementById("lista-usuarios-independientes");

  // Cargar datos según tipo de usuario
  let currentDeveloper = null;
  let currentIndUser = null;
  let independentUsersList = [];

  // Cargar lista de usuarios independientes
  try {
    const rawInd = localStorage.getItem(IND_USERS_KEY);
    if (rawInd) {
      independentUsersList = JSON.parse(rawInd);
    }
  } catch (err) {
    console.error("Error al leer lista de usuarios independientes:", err);
  }

  // Inicializar desarrollador por defecto en localStorage si no existe
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
      email: "dev@amc.com",
    };
    localStorage.setItem(DEV_USER_KEY, JSON.stringify(currentDeveloper));
  }

  // --- CONFIGURACIÓN DE LA INTERFAZ DE ACUERDO AL USUARIO ACTIVO ---
  if (isDev) {
    // Si es desarrollador
    document.getElementById("page-title").textContent = "Perfil del Desarrollador";
    nombreInput.value = currentDeveloper.nombre;
    codigoInput.value = currentDeveloper.codigo;
    emailInput.value = currentDeveloper.email || "dev@amc.com";
    claveInput.value = currentDeveloper.clave;

    // Mostrar panel de administración de usuarios independientes
    if (cardIndependientes) cardIndependientes.style.display = "block";
    renderUsuariosIndependientes();
  } else {
    // Si es usuario independiente
    document.getElementById("page-title").textContent = "Mi Perfil";
    document.getElementById("form-card-title").textContent = "Configuración de Credenciales";
    
    // Cambiar la ayuda del topbar
    const topbarHint = document.querySelector(".topbar .hint");
    if (topbarHint) {
      topbarHint.textContent = "Administra tus credenciales personales para el acceso al sistema.";
    }

    nombreInput.value = "USUARIO INDEPENDIENTE";
    nombreInput.setAttribute("readonly", "true");
    
    codigoInput.value = activeUserCode;
    codigoInput.setAttribute("readonly", "true"); // Bloqueado, no se puede cambiar
    const codigoHint = codigoInput.nextElementSibling;
    if (codigoHint) codigoHint.textContent = "Tu código identificador de usuario (no editable).";

    // Buscar los datos del usuario independiente actual
    currentIndUser = independentUsersList.find(u => u.codigo === activeUserCode);
    if (currentIndUser) {
      emailInput.value = currentIndUser.email || "";
      claveInput.value = currentIndUser.clave || "";
    } else {
      emailInput.value = "";
      claveInput.value = "";
    }

    // Ocultar sección de creación de usuarios
    if (cardIndependientes) cardIndependientes.style.display = "none";
  }

  // Cerrar sesión
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      sessionStorage.clear();
      window.location.replace("../login.html");
    });
  }

  // --- VALIDACIONES DE PARÁMETROS ---
  function validarUsuarioYClave(codigo, clave, email) {
    // Código de usuario: solo números
    if (!/^\d+$/.test(codigo)) {
      mostrarMensaje("El código de usuario debe contener únicamente números.", "error");
      return false;
    }
    // Longitud código: 4 a 10 dígitos
    if (codigo.length < 4 || codigo.length > 10) {
      mostrarMensaje("El código de usuario debe tener entre 4 y 10 dígitos.", "error");
      return false;
    }
    // Email: formato correcto
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      mostrarMensaje("Por favor, ingrese un correo electrónico válido.", "error");
      return false;
    }
    // Contraseña: min 5 caracteres
    if (clave.length < 5) {
      mostrarMensaje("La contraseña debe tener mínimo 5 caracteres.", "error");
      return false;
    }
    // Contraseña: debe incluir al menos un número
    if (!/\d/.test(clave)) {
      mostrarMensaje("La contraseña debe incluir al menos un número.", "error");
      return false;
    }
    // Contraseña: debe incluir al menos un carácter especial
    const regexEspecial = /[-*+?!@#$%^&()_={}[\]:;'"<>,.?\/~`|\\_+]/;
    if (!regexEspecial.test(clave)) {
      mostrarMensaje("La contraseña debe incluir al menos un carácter especial (ej: *, +, @, #).", "error");
      return false;
    }
    return true;
  }

  // --- GUARDAR CAMBIOS (FORMULARIO PRINCIPAL) ---
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const codigoVal = codigoInput.value.trim();
    const claveVal = claveInput.value;
    const emailVal = emailInput.value.trim();

    if (!validarUsuarioYClave(codigoVal, claveVal, emailVal)) {
      return;
    }

    if (isDev) {
      // Guardar desarrollador
      const updatedDeveloper = {
        nombre: "PRINCIPAL DESARROLLADOR",
        codigo: codigoVal,
        clave: claveVal,
        email: emailVal,
      };

      // Si el desarrollador cambia su código, actualizar la sesión activa
      sessionStorage.setItem("amc_active_user_code", codigoVal);
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(updatedDeveloper));
      mostrarMensaje("¡Credenciales del desarrollador actualizadas con éxito!", "success");
    } else {
      // Guardar usuario independiente
      const index = independentUsersList.findIndex(u => u.codigo === activeUserCode);
      if (index !== -1) {
        independentUsersList[index].clave = claveVal;
        independentUsersList[index].email = emailVal;
      } else {
        // En caso de que no existiera, lo registramos
        independentUsersList.push({
          codigo: activeUserCode,
          clave: claveVal,
          email: emailVal
        });
      }
      localStorage.setItem(IND_USERS_KEY, JSON.stringify(independentUsersList));
      mostrarMensaje("¡Tus credenciales de perfil han sido actualizadas con éxito!", "success");
    }
  });

  // --- MÓDULO DE USUARIOS INDEPENDIENTES (ACCIONES DEL DESARROLLADOR) ---
  if (isDev && formCrearInd) {
    // Formulario Crear Usuario Independiente
    formCrearInd.addEventListener("submit", (e) => {
      e.preventDefault();

      const newCodigo = newCodigoInput.value.trim();
      const newEmail = newEmailInput.value.trim();
      const newClave = newClaveInput.value;

      if (!validarUsuarioYClave(newCodigo, newClave, newEmail)) {
        return;
      }

      // Validar que el código no coincida con el desarrollador
      if (newCodigo === currentDeveloper.codigo) {
        mostrarMensaje("El código ingresado corresponde al usuario desarrollador principal.", "error");
        newCodigoInput.focus();
        return;
      }

      // Validar duplicados en la lista de independientes
      const existe = independentUsersList.some(u => u.codigo === newCodigo);
      if (existe) {
        mostrarMensaje("Ya existe un usuario independiente registrado con este código.", "error");
        newCodigoInput.focus();
        return;
      }

      // Registrar
      independentUsersList.push({
        codigo: newCodigo,
        email: newEmail,
        clave: newClave
      });

      localStorage.setItem(IND_USERS_KEY, JSON.stringify(independentUsersList));
      mostrarMensaje("¡Usuario independiente creado exitosamente!", "success");

      // Resetear formulario y renderizar lista
      formCrearInd.reset();
      renderUsuariosIndependientes();
    });
  }

  // Renderizar la tabla de usuarios independientes
  function renderUsuariosIndependientes() {
    if (!tbodyIndependientes) return;
    tbodyIndependientes.innerHTML = "";

    if (independentUsersList.length === 0) {
      tbodyIndependientes.innerHTML = `
        <tr>
          <td colspan="3" style="text-align:center; padding:15px; color:#527083;">No hay usuarios independientes registrados.</td>
        </tr>`;
      return;
    }

    independentUsersList.forEach((user) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid #cde7f0";

      // Botón Eliminar
      const tdAccion = document.createElement("td");
      tdAccion.style.padding = "8px 10px";
      tdAccion.style.textAlign = "center";

      const btnEliminar = document.createElement("button");
      btnEliminar.textContent = "Eliminar";
      btnEliminar.style.background = "#d94d6a";
      btnEliminar.style.color = "#f8fcff";
      btnEliminar.style.border = "none";
      btnEliminar.style.padding = "6px 12px";
      btnEliminar.style.borderRadius = "4px";
      btnEliminar.style.fontWeight = "bold";
      btnEliminar.style.cursor = "pointer";
      btnEliminar.style.fontSize = "0.78rem";

      btnEliminar.addEventListener("click", () => {
        if (confirm(`¿Está seguro de eliminar al usuario ${user.codigo}? Se perderá la vinculación de su sesión.`)) {
          eliminarUsuarioIndependiente(user.codigo);
        }
      });

      tdAccion.appendChild(btnEliminar);

      tr.innerHTML = `
        <td style="padding:10px; font-weight:700; color:#001e82;">${user.codigo}</td>
        <td style="padding:10px; color:#35586a;">${user.email}</td>
      `;
      tr.appendChild(tdAccion);
      tbodyIndependientes.appendChild(tr);
    });
  }

  // Eliminar usuario independiente
  function eliminarUsuarioIndependiente(codigo) {
    independentUsersList = independentUsersList.filter(u => u.codigo !== codigo);
    localStorage.setItem(IND_USERS_KEY, JSON.stringify(independentUsersList));
    mostrarMensaje("Usuario independiente eliminado correctamente.", "success");
    renderUsuariosIndependientes();
  }

  // Mostrar alerta/mensaje en pantalla
  function mostrarMensaje(texto, tipo) {
    msgDiv.innerHTML = "";
    const alertBox = document.createElement("div");
    alertBox.className = `alert alert-${tipo === "error" ? "error" : "success"}`;
    alertBox.textContent = texto;
    msgDiv.appendChild(alertBox);
    msgDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const SESSION_KEY = "amc_session_active";

  // Obtener código de usuario activo
  let activeUserCode = sessionStorage.getItem("amc_active_user_code");
  if (!activeUserCode && sessionStorage.getItem(SESSION_KEY) === "true") {
    activeUserCode = "1110591592";
    sessionStorage.setItem("amc_active_user_code", activeUserCode);
  }

  const profileKey = `amc_perfil_emisor_v1_${activeUserCode}`;

  // Elementos DOM
  const form = document.getElementById("perfil-form");
  const tipoSelect = document.getElementById("p-tipo");
  const nitInput = document.getElementById("p-nit");
  const nombreInput = document.getElementById("p-nombre");
  const direccionInput = document.getElementById("p-direccion");
  const ciudadInput = document.getElementById("p-ciudad");
  const emailInput = document.getElementById("p-email");
  
  const logoFileInput = document.getElementById("p-logo-file");
  const btnUploadTrigger = document.getElementById("btn-upload-trigger");
  const btnRemoveLogo = document.getElementById("btn-remove-logo");
  const logoPreview = document.getElementById("logo-preview");
  const msgDiv = document.getElementById("msg");

  let base64Logo = "";
  const DEFAULT_LOGO = "../assets/logo.png";

  // Cargar datos guardados
  let currentProfile = null;
  try {
    const raw = localStorage.getItem(profileKey);
    if (raw) {
      currentProfile = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error al cargar perfil:", err);
  }

  // Pre-rellenar formulario
  if (currentProfile) {
    tipoSelect.value = currentProfile.tipoPersona || "NATURAL";
    nitInput.value = currentProfile.nit || "";
    nombreInput.value = currentProfile.razonSocial || "";
    direccionInput.value = currentProfile.direccion || "";
    ciudadInput.value = currentProfile.ciudad || "";
    emailInput.value = currentProfile.email || "";
    
    if (currentProfile.logo) {
      base64Logo = currentProfile.logo;
      logoPreview.src = base64Logo;
      if (btnRemoveLogo) btnRemoveLogo.style.display = "inline-block";
    } else {
      logoPreview.src = DEFAULT_LOGO;
      if (btnRemoveLogo) btnRemoveLogo.style.display = "none";
    }
  } else {
    // Si no hay perfil, rellenar con valores por defecto del desarrollador si el código es el de dev
    if (activeUserCode === "1110591592") {
      tipoSelect.value = "NATURAL";
      nitInput.value = "1.110.591.592-3";
      nombreInput.value = "ANDRES MAURICIO CAMPOS FIERRO";
      direccionInput.value = "Colombia";
      ciudadInput.value = "Bogotá";
      emailInput.value = "dev@amc.com";
      logoPreview.src = DEFAULT_LOGO;
    }
  }

  // Cargar imagen
  if (btnUploadTrigger) {
    btnUploadTrigger.addEventListener("click", () => {
      if (logoFileInput) logoFileInput.click();
    });
  }

  if (logoFileInput) {
    logoFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        mostrarMensaje("Por favor, seleccione un archivo de imagen válido.", "error");
        return;
      }

      // Validar tamaño máximo para no saturar localStorage (límite razonable 1.5MB)
      if (file.size > 1.5 * 1024 * 1024) {
        mostrarMensaje("La imagen es demasiado grande. Seleccione una menor a 1.5 MB.", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = function(event) {
        base64Logo = event.target.result;
        if (logoPreview) logoPreview.src = base64Logo;
        if (btnRemoveLogo) btnRemoveLogo.style.display = "inline-block";
        mostrarMensaje("Logo cargado correctamente. Recuerde guardar los cambios.", "success");
      };
      reader.readAsDataURL(file);
    });
  }

  // Quitar logo
  if (btnRemoveLogo) {
    btnRemoveLogo.addEventListener("click", () => {
      base64Logo = "";
      if (logoPreview) logoPreview.src = DEFAULT_LOGO;
      btnRemoveLogo.style.display = "none";
      if (logoFileInput) logoFileInput.value = "";
      mostrarMensaje("Se ha quitado el logo personalizado. Recuerde guardar los cambios.", "success");
    });
  }

  // Formulario submit
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const perfil = {
        tipoPersona: tipoSelect.value,
        nit: nitInput.value.trim(),
        razonSocial: nombreInput.value.trim(),
        direccion: direccionInput.value.trim(),
        ciudad: ciudadInput.value.trim(),
        email: emailInput.value.trim(),
        logo: base64Logo || ""
      };

      try {
        localStorage.setItem(profileKey, JSON.stringify(perfil));
        mostrarMensaje("¡Perfil de facturación guardado exitosamente!", "success");
      } catch (err) {
        console.error(err);
        // Si excede cuota de localStorage
        if (err.name === "QuotaExceededError" || err.code === 22) {
          mostrarMensaje("No hay suficiente espacio en el navegador para guardar esta imagen. Use un logo más ligero.", "error");
        } else {
          mostrarMensaje("Error al guardar los datos en base de datos local.", "error");
        }
      }
    });
  }

  function mostrarMensaje(texto, tipo) {
    if (!msgDiv) return;
    msgDiv.innerHTML = "";
    const alertBox = document.createElement("div");
    alertBox.className = `alert alert-${tipo === "error" ? "error" : "success"}`;
    alertBox.textContent = texto;
    msgDiv.appendChild(alertBox);
    msgDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

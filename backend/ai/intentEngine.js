'use strict';

const { domains, intents, modules, trainingExamples } = require('./catalog');

const STOP_WORDS = new Set(['como', 'para', 'sobre', 'desde', 'donde', 'puedo', 'quiero', 'necesito', 'ayuda', 'sistema', 'modulo', 'mauro', 'una', 'uno', 'unos', 'unas', 'los', 'las', 'del', 'por', 'con', 'que', 'de', 'el', 'la', 'y', 'en', 'se', 'mi', 'me', 'un']);
const NAVIGATION_VERB = /\b(abrir|abre|abreme|ir|ingresar|entra|acceder|llevame|llevarme|navegar|navega|mostrar|muestrame|ver|visitar)\b|\bcomo llego\b|\bdonde encuentro\b/;

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9@._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordVariants(word) {
  const base = word.replace(/[^a-z0-9]/g, '');
  if (base.length < 3) return [];
  if (base.endsWith('s')) return [base, base.slice(0, -1)];
  return [base, `${base}s`];
}

function tokensOf(value) {
  return normalizar(value).split(' ').filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function scoreIntent(text, candidate) {
  let score = 0;
  let specificMatches = 0;
  for (const cue of candidate.cues) {
    const normalizedCue = normalizar(cue);
    if (!normalizedCue) continue;
    const cueTokens = [...new Set(tokensOf(normalizedCue))];
    const matched = cueTokens.filter((token) => wordVariants(token).some((variant) => new RegExp(`(?:^|\\s)${variant}(?:$|\\s)`).test(text)));
    if (text.includes(normalizedCue)) {
      score = Math.max(score, 32 + cueTokens.length * 5 + normalizedCue.length / 10);
      specificMatches += 1;
    } else if (cueTokens.length === 1 && matched.length === 1) {
      score = Math.max(score, 22 + cueTokens[0].length);
      specificMatches += 1;
    } else if (matched.length >= 2) {
      score = Math.max(score, 20 + matched.length * 7 + (matched.length === cueTokens.length ? 4 : 0));
      specificMatches += 1;
    }
  }
  const intentTokens = new Set([...tokensOf(candidate.title), ...tokensOf(candidate.seed)]);
  let tokenScore = 0;
  for (const token of intentTokens) {
    if (wordVariants(token).some((variant) => new RegExp(`(?:^|\\s)${variant}(?:$|\\s)`).test(text))) tokenScore += token.length >= 6 ? 4 : 3;
  }
  if (tokenScore >= 6) score = Math.max(score, tokenScore + specificMatches * 2);
  return score;
}

function detectNavigation(text) {
  if (!NAVIGATION_VERB.test(text)) return null;
  const navigation = domains.find((domain) => domain.id === 'navegacion');
  const matches = navigation.intents
    .map((candidate) => ({ candidate, score: scoreIntent(text, candidate) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
  return matches[0]?.candidate || null;
}

function detectIntent(text, context = {}) {
  const normalized = normalizar(text);
  const exactExample = trainingExamples.find((example) => normalizar(example.text) === normalized);
  if (exactExample) return intents.find((candidate) => candidate.id === exactExample.intentId) || null;
  const navigationIntent = detectNavigation(normalized);
  if (navigationIntent) return navigationIntent;

  const candidates = intents
    .filter((candidate) => candidate.domainId !== 'navegacion')
    .map((candidate) => ({ candidate, score: scoreIntent(normalized, candidate) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  const best = candidates[0];
  if (best) {
    // Un saludo acompaña la conversación; no debe desplazar una consulta de negocio.
    if (best.candidate.kind === 'greeting' && candidates.some((item) => item.candidate.domainId !== 'general')) {
      return candidates.find((item) => item.candidate.domainId !== 'general')?.candidate || best.candidate;
    }
    return best.candidate;
  }

  if (context.lastIntent) {
    const previous = intents.find((candidate) => candidate.id === context.lastIntent);
    if (previous && /^(y|tambien|ademas|como sigo|que sigue|mas informacion|me explicas|y ahora|ese|esa|eso)\b/.test(normalized)) return previous;
  }
  return null;
}

function detectSecurityRequest(text) {
  const normalized = normalizar(text);
  const crossTenant = /\b(otra empresa|otras empresas|empresa ajena|empresa diferente|otro tenant|datos de otro cliente|informacion de otro cliente)\b/.test(normalized);
  const asksForSecrets = /\b(muestra|dime|revela|entrega|imprime|consulta|dame|extrae|copia|ver)\b.{0,40}\b(contrasena|password|token|jwt|api key|api_key|credencial|secreto|secret)\b/.test(normalized)
    || /\b(contrasena|password|token|jwt|api key|api_key|credencial|secreto|secret)\b.{0,30}\b(actual|administrador|empresa|usuario)\b/.test(normalized);
  const asksForSql = /\b(select|insert|update|delete|drop|alter|truncate)\b.{0,50}\b(sql|tabla|base de datos|consulta|query)\b/.test(normalized)
    || /\b(sql|sentencia|query)\b.{0,30}\b(interna|real|base de datos|tabla)\b/.test(normalized)
    || /\b(muestra|muestrame|dame|explicame|dime|ensename)\b.{0,25}\b(sql|sentencia|query)\b/.test(normalized)
    || /\b(ignora|omite|desactiva)\b.{0,40}\b(reglas|instrucciones|seguridad|permisos)\b/.test(normalized);
  if (crossTenant || asksForSecrets || asksForSql) return 'security';
  return null;
}

function actionFor(moduleKey, role) {
  const target = modules[moduleKey];
  if (!target) return { action: null, reason: 'unavailable' };
  const normalizedRole = String(role || '').toUpperCase();
  if (target.roles && !target.roles.includes(normalizedRole)) return { action: null, reason: 'forbidden' };
  if (!target.available) return { action: null, reason: 'unavailable' };
  return {
    action: { label: target.label === 'Mauro IA' ? 'Continuar con Mauro IA' : `Abrir ${target.label}`, moduleKey, route: target.route },
    reason: null,
  };
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function buildReply(candidate, { role, context = {}, text = '' } = {}) {
  if (!candidate) {
    return {
      intencion: 'AYUDA', tipo: 'help', titulo: 'Estoy para ayudarte',
      mensaje: 'Con gusto te acompaño. Puedo orientarte en facturación, clientes, productos, inventario, compras, nómina, reportes, calendario y DIAN. Cuéntame qué necesitas resolver y te indico el módulo adecuado.',
      seguimiento: '¿Con cuál de esos procesos quieres comenzar?', acciones: [], sugerencias: [],
    };
  }

  if (candidate.domainId === 'general') {
    const variants = {
      greeting: [
        '¡Hola! Qué gusto saludarte. Soy Mauro IA, el asistente de AMC; puedo orientarte en los módulos del sistema.',
        '¡Hola! Aquí estoy para ayudarte con tus procesos de AMC, paso a paso.',
        '¡Buen día! Soy Mauro IA. Cuéntame qué gestión quieres realizar y te guío.',
      ],
      identity: [
        'Soy Mauro IA, el asistente inteligente de AMC Facturación Electrónica y POS. Te oriento sobre los módulos y puedo consultar algunas herramientas autorizadas.',
        'Me llamo Mauro IA. Acompaño a los usuarios de AMC con orientación sobre facturación, inventario y otros procesos empresariales.',
        'Soy el asistente oficial de AMC. Puedo guiarte y abrir módulos habilitados; cuando consulte información real te indicaré de dónde viene.',
      ],
      capabilities: [
        'Puedo orientarte sobre los módulos, ayudarte a encontrar funciones y consultar existencias de productos por código dentro de tu empresa.',
        'Te puedo guiar en facturación, terceros, productos, inventarios, compras, POS, nómina, reportes y calendario. También tengo una consulta de inventario en tiempo real por código.',
        'Puedo responder preguntas de uso, sugerir el módulo correcto y consultar herramientas disponibles con los permisos de tu sesión.',
      ],
      thanks: [
        '¡Con mucho gusto! Aquí estaré cuando necesites otra orientación.',
        'Gracias a ti por usar AMC. ¿Hay algún otro proceso en el que te pueda ayudar?',
        '¡Hasta luego! Cuando regreses, seguimos con lo que necesites.',
      ],
    };
    const options = variants[candidate.kind] || variants.greeting;
    const message = options[(context.turnCount || 0) % options.length];
    return {
      intencion: candidate.id, dominio: candidate.domainId, tipo: 'conversation', titulo: candidate.title,
      mensaje: message, seguimiento: candidate.kind === 'thanks' ? '¿Quieres revisar algo más antes de cerrar?' : '¿Qué te gustaría hacer ahora?',
      acciones: [], sugerencias: [],
    };
  }

  const module = candidate.moduleKey ? modules[candidate.moduleKey] : null;
  const { action, reason } = candidate.moduleKey ? actionFor(candidate.moduleKey, role) : { action: null, reason: null };
  let guidance;

  if (candidate.kind === 'navigate') {
    if (reason === 'unavailable') {
      guidance = `El módulo ${module.label} todavía no tiene una pantalla habilitada en esta versión; no voy a enviarte a una dirección inexistente.`;
    } else if (reason === 'forbidden') {
      guidance = `La ruta de ${module.label} está reservada para perfiles autorizados. Si necesitas ese acceso, solicítalo al administrador de tu empresa.`;
    } else {
      guidance = `Puedes abrir ${module.label} con el botón que te dejo aquí. La navegación se limita a las rutas internas verificadas de AMC.`;
    }
  } else if (reason === 'forbidden') {
    guidance = `La consulta de ${module.label} requiere un perfil autorizado. Si necesitas esa función, solicita acceso al administrador de tu empresa.`;
  } else if (reason === 'unavailable') {
    guidance = `La función de ${candidate.title.toLowerCase()} todavía no está conectada a una pantalla o herramienta activa de AMC en esta versión.`;
  } else if (candidate.kind === 'stock') {
    guidance = 'Puedo consultar existencias reales de tu empresa si me compartes el código exacto del producto; no inventaré cantidades.';
  } else if (candidate.domainId === 'contabilidad' || candidate.domainId === 'backups') {
    guidance = `Puedo explicarte el concepto de ${candidate.title.toLowerCase()}, pero esa función no está conectada a una pantalla o herramienta activa de AMC en esta versión.`;
  } else if (candidate.domainId === 'reportes') {
    guidance = `Para ver cifras reales de ${candidate.title.toLowerCase()}, abre Reportes. Este chat no calcula ni inventa indicadores que no haya consultado en una herramienta autorizada.`;
  } else if (candidate.domainId === 'dian') {
    guidance = 'Puedo orientarte sobre el proceso. El estado de transmisión o validación debe confirmarse en el documento y en la integración DIAN disponible para tu empresa.';
  } else if (candidate.domainId === 'soporte') {
    guidance = 'Revisa el mensaje de validación y los datos del documento en el módulo correspondiente. Si el problema continúa, utiliza los canales de soporte visibles en AMC.';
  } else {
    guidance = `El proceso de ${candidate.title.toLowerCase()} se gestiona desde ${module?.label || 'el módulo correspondiente'}. Esta guía no crea ni modifica registros por sí sola.`;
  }

  const variantIndex = ((context.turnCount || 0) + (hash(text) % candidate.responseTemplates.length)) % candidate.responseTemplates.length;
  const topic = candidate.title.toLowerCase();
  const mensaje = candidate.responseTemplates[variantIndex]
    .replace('{topic}', topic)
    .replace('{guidance}', guidance);
  const seguimiento = candidate.kind === 'stock'
    ? '¿Me compartes el código del producto para revisar su existencia?'
    : (reason === 'unavailable' ? '¿Quieres que te ayude con otro módulo que sí esté habilitado?' : candidate.followUpTemplates[variantIndex]);
  return {
    intencion: candidate.id,
    dominio: candidate.domainId,
    tipo: 'answer',
    titulo: candidate.title,
    mensaje,
    seguimiento,
    acciones: action ? [action] : [],
    sugerencias: [],
    ...(reason ? { aviso: reason } : {}),
  };
}

module.exports = { normalizar, detectIntent, detectNavigation, detectSecurityRequest, actionFor, buildReply };

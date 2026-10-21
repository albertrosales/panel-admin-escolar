const axios = require('axios');

function buildClient(moodleUrl, token) {
  // Acepta la dirección con o sin https:// y con o sin barra final
  let base = String(moodleUrl || '').trim().replace(/\/+$/, '');
  if (base && !/^https?:\/\//i.test(base)) base = 'https://' + base;
  const endpoint = base + '/webservice/rest/server.php';

  return async function callMoodle(wsfunction, params) {
    params = params || {};
    const response = await axios.get(endpoint, {
      params: Object.assign({
        wstoken: token,
        wsfunction: wsfunction,
        moodlewsrestformat: 'json'
      }, params)
    });
    if (response.data && response.data.exception) {
      throw new Error('Moodle API error (' + wsfunction + '): ' + response.data.message);
    }
    return response.data;
  };
}

const STUDENT_ROLE_ID = 5;
const TEACHER_ROLE_ID = 3;

async function setEnrolmentSuspension(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  const courses = await call('core_enrol_get_users_courses', { userid: opts.moodleUserId });
  const results = [];
  for (const course of courses) {
    const enrolments = await call('core_enrol_get_enrolled_users', { courseid: course.id });
    const enrolment = enrolments.find(function (e) { return e.id === opts.moodleUserId; });
    if (!enrolment) continue;

    const res = await call('enrol_manual_enrol_users', {
      'enrolments[0][roleid]': 5,
      'enrolments[0][userid]': opts.moodleUserId,
      'enrolments[0][courseid]': course.id,
      'enrolments[0][suspend]': opts.suspend ? 1 : 0
    });
    results.push({ courseId: course.id, res: res });
  }
  return results;
}

async function getUserByEmail(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  const res = await call('core_user_get_users', {
    'criteria[0][key]': 'email',
    'criteria[0][value]': opts.email
  });
  return (res.users && res.users[0]) || null;
}

async function setIdNumber(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  return call('core_user_update_users', {
    'users[0][id]': opts.userId,
    'users[0][idnumber]': opts.idnumber
  });
}

async function getCourses(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  const courses = await call('core_course_get_courses');
  return courses.filter(function (c) { return c.id !== 1; });
}

async function getEnrolledUsers(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  return call('core_enrol_get_enrolled_users', { courseid: opts.courseId });
}

async function createUser(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  const res = await call('core_user_create_users', {
    'users[0][username]': opts.username,
    'users[0][firstname]': opts.firstname,
    'users[0][lastname]': opts.lastname,
    'users[0][email]': opts.email,
    'users[0][password]': opts.password,
    'users[0][auth]': 'manual'
  });
  return res[0];
}

function generarPasswordSegura() {
  const especiales = '!@#$%^&*';
  const especial = especiales[Math.floor(Math.random() * especiales.length)];
  return 'Aa1' + especial + Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-4).toUpperCase();
}

async function updatePassword(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  return call('core_user_update_users', { 'users[0][id]': opts.userId, 'users[0][password]': opts.password });
}

async function getUserById(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  const r = await call('core_user_get_users_by_field', { field: 'id', 'values[0]': opts.userId });
  return r && r[0] ? r[0] : null;
}

async function getOrCreateUser(opts) {
  if (!opts.email) throw new Error('Se requiere un correo para crear el usuario en Moodle');

  const existente = await getUserByEmail({ moodleUrl: opts.moodleUrl, token: opts.token, email: opts.email });
  if (existente) return { id: existente.id, creado: false, idnumber: existente.idnumber || '' };

  const partes = opts.nombreCompleto.trim().split(/\s+/);
  const firstname = partes[0];
  const lastname = partes.slice(1).join(' ') || partes[0];
  const username = opts.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') + Math.floor(Math.random() * 1000);
  const password = generarPasswordSegura();

  const creado = await createUser({
    moodleUrl: opts.moodleUrl, token: opts.token, username: username,
    firstname: firstname, lastname: lastname, email: opts.email, password: password
  });
  return { id: creado.id, creado: true, username: username, password: password };
}

async function enrolUser(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  return call('enrol_manual_enrol_users', {
    'enrolments[0][roleid]': opts.roleId,
    'enrolments[0][userid]': opts.userId,
    'enrolments[0][courseid]': opts.courseId,
    'enrolments[0][suspend]': opts.suspend || 0
  });
}

async function unenrolUser(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  return call('enrol_manual_unenrol_users', {
    'enrolments[0][roleid]': opts.roleId,
    'enrolments[0][userid]': opts.userId,
    'enrolments[0][courseid]': opts.courseId
  });
}

/**
 * Lista las categorías de cursos de Moodle (ej: 7° GRADO, 8° GRADO, 9° GRADO).
 */
async function getCategories(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  const categorias = await call('core_course_get_categories');
  return categorias.filter(function (c) { return c.visible !== 0; });
}

/**
 * Crea un curso nuevo en Moodle, dentro de una categoría específica.
 * Devuelve el curso creado (incluyendo su id).
 */
async function createCourse(opts) {
  const call = buildClient(opts.moodleUrl, opts.token);
  const shortname = (opts.fullname + '-' + Date.now()).slice(0, 100).replace(/\s+/g, '-');
  const res = await call('core_course_create_courses', {
    'courses[0][fullname]': opts.fullname,
    'courses[0][shortname]': shortname,
    'courses[0][categoryid]': opts.categoryId
  });
  return res[0]; // { id, shortname }
}

module.exports = {
  setIdNumber: setIdNumber,
  buildClient: buildClient,
  setEnrolmentSuspension: setEnrolmentSuspension,
  getUserByEmail: getUserByEmail,
  getCourses: getCourses,
  getEnrolledUsers: getEnrolledUsers,
  createUser: createUser,
  getOrCreateUser: getOrCreateUser,
  updatePassword: updatePassword,
  getUserById: getUserById,
  generarPasswordSegura: generarPasswordSegura,
  enrolUser: enrolUser,
  unenrolUser: unenrolUser,
  getCategories: getCategories,
  createCourse: createCourse,
  STUDENT_ROLE_ID: STUDENT_ROLE_ID,
  TEACHER_ROLE_ID: TEACHER_ROLE_ID
};

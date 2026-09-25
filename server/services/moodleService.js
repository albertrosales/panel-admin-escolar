const axios = require('axios');

function buildClient(moodleUrl, token) {
  const endpoint = moodleUrl.replace(/\/$/, '') + '/webservice/rest/server.php';

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

async function getOrCreateUser(opts) {
  if (!opts.email) throw new Error('Se requiere un correo para crear el usuario en Moodle');

  const existente = await getUserByEmail({ moodleUrl: opts.moodleUrl, token: opts.token, email: opts.email });
  if (existente) return { id: existente.id, creado: false };

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

module.exports = {
  buildClient: buildClient,
  setEnrolmentSuspension: setEnrolmentSuspension,
  getUserByEmail: getUserByEmail,
  getCourses: getCourses,
  getEnrolledUsers: getEnrolledUsers,
  createUser: createUser,
  getOrCreateUser: getOrCreateUser,
  enrolUser: enrolUser,
  STUDENT_ROLE_ID: STUDENT_ROLE_ID,
  TEACHER_ROLE_ID: TEACHER_ROLE_ID
};

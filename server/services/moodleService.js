/**
 * Servicio de integración con Moodle Web Services (REST API).
 * Requiere que en el Moodle del colegio esté habilitado un "web service"
 * con un token que tenga permisos sobre:
 *   - core_user_get_users
 *   - enrol_manual_enrol_users
 *   - core_enrol_get_enrolled_users
 *   - core_user_update_users
 */

const axios = require('axios');

function buildClient(moodleUrl, token) {
  const endpoint = `${moodleUrl.replace(/\/$/, '')}/webservice/rest/server.php`;

  return async function callMoodle(wsfunction, params = {}) {
    const response = await axios.get(endpoint, {
      params: {
        wstoken: token,
        wsfunction,
        moodlewsrestformat: 'json',
        ...params
      }
    });
    if (response.data?.exception) {
      throw new Error(`Moodle API error (${wsfunction}): ${response.data.message}`);
    }
    return response.data;
  };
}

/**
 * Suspende o activa la matrícula de un alumno en TODOS sus cursos.
 * suspend = true  -> bloquea acceso (moroso)
 * suspend = false -> restaura acceso (al día / plan de pago)
 */
async function setEnrolmentSuspension({ moodleUrl, token, moodleUserId, suspend }) {
  const call = buildClient(moodleUrl, token);

  // 1. Obtener cursos en los que está matriculado
  const courses = await call('core_enrol_get_users_courses', { userid: moodleUserId });

  // 2. Actualizar el estado de matrícula (suspend: 1 = bloqueado, 0 = activo)
  const results = [];
  for (const course of courses) {
    const enrolments = await call('core_enrol_get_enrolled_users', { courseid: course.id });
    const enrolment = enrolments.find(e => e.id === moodleUserId);
    if (!enrolment) continue;

    const res = await call('enrol_manual_enrol_users', {
      'enrolments[0][roleid]': 5, // 5 = student
      'enrolments[0][userid]': moodleUserId,
      'enrolments[0][courseid]': course.id,
      'enrolments[0][suspend]': suspend ? 1 : 0
    });
    results.push({ courseId: course.id, res });
  }
  return results;
}

async function getUserByEmail({ moodleUrl, token, email }) {
  const call = buildClient(moodleUrl, token);
  const res = await call('core_user_get_users', {
    'criteria[0][key]': 'email',
    'criteria[0][value]': email
  });
  return res.users?.[0] || null;
}

/**
 * Lista todos los cursos del Moodle (excluye el curso 1, que es el sitio principal).
 */
async function getCourses({ moodleUrl, token }) {
  const call = buildClient(moodleUrl, token);
  const courses = await call('core_course_get_courses');
  return courses.filter(c => c.id !== 1);
}

/**
 * Lista los usuarios matriculados en un curso, con sus roles (student, editingteacher, etc.)
 */
async function getEnrolledUsers({ moodleUrl, token, courseId }) {
  const call = buildClient(moodleUrl, token);
  return call('core_enrol_get_enrolled_users', { courseid: courseId });
}

module.exports = {
  buildClient,
  setEnrolmentSuspension,
  getUserByEmail,
  getCourses,
  getEnrolledUsers
};

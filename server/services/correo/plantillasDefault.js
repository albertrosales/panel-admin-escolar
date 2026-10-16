// Plantillas predeterminadas. Se pueden editar por colegio (se guardan en plantillas_correo).
// auto: null = solo envío manual; { evento, activa (por defecto), parametro: { etiqueta, valor } }
const INST = '{{nombre_institucion}}';

const PLANTILLAS = [
  { clave: 'recordatorio_vencimiento', grupo: 'Pagos', nombre: 'Mensualidad próxima a vencer',
    asunto: 'Recordatorio de mensualidad',
    cuerpo: `Estimado padre, madre o encargado:\n\nLe recordamos que la mensualidad de {{mes}} de {{nombre_alumno}} vence el {{fecha_vencimiento}}.\n\nMonto pendiente: {{monto}}\n\nGracias por mantener sus pagos al día.\n\n${INST}`,
    auto: { evento: 'Se envía cuando faltan los días indicados para el vencimiento', activa: false, parametro: { etiqueta: 'Días de anticipación', valor: 3 } } },
  { clave: 'mensualidad_vencida', grupo: 'Pagos', nombre: 'Mensualidad vencida',
    asunto: 'Mensualidad pendiente de pago',
    cuerpo: `Le informamos que la mensualidad de {{nombre_alumno}}, correspondiente a {{mes}}, está pendiente de pago.\n\nMonto pendiente: {{monto}}\n\nPara consultas, comuníquese con administración.\n\n${INST}`,
    auto: { evento: 'Se envía una vez cuando el cobro vence sin pago ni comprobante en revisión', activa: false } },
  { clave: 'pago_confirmado', grupo: 'Pagos', nombre: 'Pago recibido y confirmado',
    asunto: 'Confirmación de pago',
    cuerpo: `Confirmamos el pago de {{monto}} correspondiente a {{concepto}} de {{nombre_alumno}}.\n\nFecha: {{fecha_pago}}\n\nGracias por su pago.\n\n${INST}`,
    auto: { evento: 'Se envía cuando administración valida y registra el pago', activa: true } },
  { clave: 'comprobante_recibido', grupo: 'Pagos', nombre: 'Comprobante recibido y en revisión',
    asunto: 'Comprobante de pago en revisión',
    cuerpo: `Estimado padre, madre o encargado:\n\nHemos recibido el comprobante de pago de {{nombre_alumno}} por un monto de {{monto}}.\n\nEl comprobante se encuentra en proceso de revisión. Le notificaremos cuando el pago sea confirmado.\n\n${INST}`,
    auto: { evento: 'Se envía cuando se sube un comprobante (no confirma el pago)', activa: true } },
  { clave: 'comprobante_rechazado', grupo: 'Pagos', nombre: 'Comprobante rechazado',
    asunto: 'Comprobante de pago pendiente de corrección',
    cuerpo: `El comprobante de pago de {{nombre_alumno}} no pudo ser validado.\n\nMotivo: {{motivo_rechazo}}\n\nPor favor, revise la información y vuelva a subir el comprobante correspondiente.\n\n${INST}`,
    auto: { evento: 'Se envía cuando administración rechaza un comprobante, con el motivo registrado', activa: true } },
  { clave: 'ausencia', grupo: 'Asistencia', nombre: 'Ausencia del alumno',
    asunto: 'Aviso de ausencia',
    cuerpo: `Le informamos que {{nombre_alumno}} registra una ausencia el día {{fecha}}.\n\nSi la ausencia ya fue justificada, puede omitir este aviso.\n\n${INST}`,
    auto: { evento: 'Se envía al registrar una ausencia', activa: false } },
  { clave: 'asistencia_registrada', grupo: 'Asistencia', nombre: 'Asistencia registrada',
    asunto: 'Registro de asistencia',
    cuerpo: `Se registró la asistencia de {{nombre_alumno}} el día {{fecha}}.\n\nEstado: {{estado_asistencia}}\n\n${INST}`,
    auto: { evento: 'Se envía al registrar la asistencia de cada alumno', activa: false } },
  { clave: 'ausencias_consecutivas', grupo: 'Asistencia', nombre: 'Ausencias consecutivas',
    asunto: 'Seguimiento de asistencia',
    cuerpo: `{{nombre_alumno}} registra {{cantidad_ausencias}} ausencias durante el período reciente.\n\nLe agradecemos comunicarse con la institución para dar seguimiento a esta situación.\n\n${INST}`,
    auto: { evento: 'Se envía cuando el alumno acumula las ausencias consecutivas indicadas', activa: false, parametro: { etiqueta: 'Ausencias consecutivas', valor: 3 } } },
  { clave: 'calificaciones_disponibles', grupo: 'Académico', nombre: 'Calificaciones disponibles',
    asunto: 'Calificaciones disponibles',
    cuerpo: `Las calificaciones de {{nombre_alumno}}, correspondientes a {{periodo}}, ya están disponibles en la plataforma.\n\n${INST}`, auto: null },
  { clave: 'reunion_padres', grupo: 'Académico', nombre: 'Reunión de padres',
    asunto: 'Convocatoria a reunión',
    cuerpo: `Le invitamos a la reunión de padres de familia el {{fecha}}, a las {{hora}}, en {{lugar}}.\n\nAgradecemos su puntual asistencia.\n\n${INST}`, auto: null },
  { clave: 'documentacion_pendiente', grupo: 'Académico', nombre: 'Documentación pendiente',
    asunto: 'Documentación pendiente',
    cuerpo: `El expediente de {{nombre_alumno}} tiene documentos pendientes.\n\nDocumentos: {{documentos_pendientes}}\n\nPara más información, comuníquese con secretaría.\n\n${INST}`, auto: null },
  { clave: 'recordatorio_matricula', grupo: 'Académico', nombre: 'Recordatorio de matrícula',
    asunto: 'Recordatorio de matrícula',
    cuerpo: `Le recordamos completar la matrícula de {{nombre_alumno}} para el período {{periodo_academico}}.\n\nPara conocer los requisitos, comuníquese con administración.\n\n${INST}`, auto: null },
  { clave: 'comunicado_general', grupo: 'Dirección', nombre: 'Comunicado general del director',
    asunto: '{{asunto}}',
    cuerpo: `Estimados padres, estudiantes y encargados:\n\n{{mensaje_director}}\n\nAtentamente,\nDirección de ${INST}`, auto: null },
  { clave: 'mensaje_personalizado', grupo: 'Dirección', nombre: 'Mensaje personalizado',
    asunto: '{{asunto}}',
    cuerpo: `Estimado(a) {{nombre_destinatario}}:\n\n{{mensaje_personalizado}}\n\nAtentamente,\n{{nombre_director}}\n${INST}`, auto: null },
  { clave: 'felicitacion', grupo: 'Dirección', nombre: 'Felicitación académica',
    asunto: '¡Felicitaciones por el desempeño académico!',
    cuerpo: `Felicitamos a {{nombre_alumno}} por su esfuerzo y buen desempeño durante {{periodo_academico}}.\n\n¡Muchos éxitos!\n\n${INST}`, auto: null },
  { clave: 'aviso_importante', grupo: 'Dirección', nombre: 'Aviso importante o urgente',
    asunto: 'Aviso importante: {{asunto}}',
    cuerpo: `Estimados padres, estudiantes y encargados:\n\n{{mensaje_director}}\n\nFecha importante: {{fecha_actividad}}\n\nAtentamente,\nDirección de ${INST}`, auto: null }
];

// Variables que se completan automáticamente con datos de la base de datos
const AUTO_VARS = ['nombre_institucion', 'nombre_alumno', 'codigo_alumno', 'nombre_destinatario', 'mes', 'fecha_vencimiento', 'monto', 'concepto',
  'fecha_pago', 'motivo_rechazo', 'estado_asistencia', 'cantidad_ausencias'];
// Variables que escribe quien envía (si la plantilla las usa)
const MANUAL_VARS = {
  asunto: 'Asunto', mensaje_director: 'Mensaje', mensaje_personalizado: 'Mensaje', fecha: 'Fecha', hora: 'Hora', lugar: 'Lugar',
  periodo: 'Período (ej. 1.er parcial)', periodo_academico: 'Período académico (ej. 2026)', documentos_pendientes: 'Documentos pendientes',
  fecha_actividad: 'Fecha importante', nombre_director: 'Nombre del director'
};

module.exports = { PLANTILLAS, AUTO_VARS, MANUAL_VARS, porClave: (c) => PLANTILLAS.find((p) => p.clave === c) };

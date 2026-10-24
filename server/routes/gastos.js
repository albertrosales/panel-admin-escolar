const crear = require('./movimientos');
module.exports = crear({
  tabla: 'gastos', tablaCat: 'gasto_categorias',
  metodos: ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro'],
  base: ['Almuerzo', 'Alimentación en reuniones', 'Refrigerios y eventos', 'Papelería y útiles', 'Material didáctico', 'Limpieza',
    'Mantenimiento y reparaciones', 'Servicios (agua, luz, internet)', 'Transporte', 'Publicidad y promoción', 'Salarios y honorarios', 'Equipo y tecnología', 'Otros']
});

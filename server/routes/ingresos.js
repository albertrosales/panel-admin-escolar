const crear = require('./movimientos');
module.exports = crear({
  tabla: 'ingresos', tablaCat: 'ingreso_categorias',
  metodos: ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro'],
  base: ['Donaciones', 'Eventos y actividades', 'Viajes y excursiones', 'Rifas y bingos', 'Venta de uniformes y útiles', 'Cafetería o kiosco',
    'Alquiler de instalaciones', 'Patrocinios', 'Otros']
});

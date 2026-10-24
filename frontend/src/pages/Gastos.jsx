import Movimientos from '../components/Movimientos';
import { api } from '../api';

export default function Gastos() {
  return <Movimientos api={api.gastos} textos={{ titulo: 'Gastos', registrar: 'Registrar gasto', pregunta: '¿En qué se gastó?', ejemplo: 'Ej. Almuerzo de la reunión con padres de 7.º grado',
    quien: 'Proveedor o a quién se pagó', quienCorto: 'Proveedor', archivo: 'gastos' }} />;
}

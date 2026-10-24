import Movimientos from '../components/Movimientos';
import { api } from '../api';

export default function Ingresos() {
  return <Movimientos api={api.ingresos} textos={{ titulo: 'Otros ingresos', registrar: 'Registrar ingreso', pregunta: '¿De qué es el ingreso?', ejemplo: 'Ej. Donación del Sr. López para el laboratorio',
    quien: 'De quién o de dónde viene', quienCorto: 'Origen', archivo: 'ingresos' }} />;
}

export default function SelectorClases({ grados, seleccionados, onChange }) {
  function toggle(id) {
    if (seleccionados.includes(id)) {
      onChange(seleccionados.filter((g) => g !== id));
    } else {
      onChange([...seleccionados, id]);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {grados.map((g) => (
        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={seleccionados.includes(g.id)} onChange={() => toggle(g.id)} />
          {g.nombre}
        </label>
      ))}
      {grados.length === 0 && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No hay clases disponibles.</p>
      )}
    </div>
  );
}

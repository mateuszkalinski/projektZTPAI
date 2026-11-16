// Wyświetla błąd z API (komunikat + błędy pól walidacji)
export default function ErrorMessage({ error }) {
  if (!error) return null
  const fields = Object.entries(error.fieldErrors || {})
  return (
    <div className="error" role="alert">
      <p>{error.message}</p>
      {fields.length > 0 && (
        <ul>
          {fields.map(([field, msg]) => (
            <li key={field}>
              <strong>{field}</strong>: {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

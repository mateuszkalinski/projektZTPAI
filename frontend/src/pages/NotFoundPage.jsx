import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <section className="card narrow">
      <h1>Nie ma takiej strony</h1>
      <Link to="/">Wróć na start</Link>
    </section>
  )
}

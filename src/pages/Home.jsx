import { useApp } from '../context/AppContext'

export default function Home({ navigate }) {
  const { universos } = useApp()

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hero-glow" />
        <h1 className="home-title">⚔ RolApp</h1>
        <p className="home-subtitle">Tu mesa de rol escrita. Sin límites, sin IA. Solo tu historia.</p>
        <button className="btn-primary btn-lg" onClick={() => navigate('universos')}>
          Comenzar →
        </button>
      </div>

      <div className="home-cards">
        <div className="home-card" onClick={() => navigate('universos')}>
          <span className="home-card-icon">🌍</span>
          <h3>Universos</h3>
          <p>Crea y gestiona tus mundos de ficción</p>
          <span className="home-card-count">{universos.length} creados</span>
        </div>
        <div className="home-card" onClick={() => navigate('personajes')}>
          <span className="home-card-icon">👤</span>
          <h3>Personajes</h3>
          <p>Da vida a tus personajes con historia y atributos</p>
        </div>
        <div className="home-card">
          <span className="home-card-icon">✍️</span>
          <h3>Mesa de Rol</h3>
          <p>Selecciona un universo y empieza a escribir tu historia</p>
        </div>
      </div>
    </div>
  )
}

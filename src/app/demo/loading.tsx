export default function Loading() {
  return (
    <main
      className="skeleton-page"
      aria-label="Loading demonstration workspace"
      role="status"
    >
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </main>
  );
}

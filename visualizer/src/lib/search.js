export async function querySearch(query, limit = 16) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit)
  });
  const response = await fetch(`/api/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  return response.json();
}


// QPDF compares the complete reachable object graph, not a page rasterization.
globalThis.oneOdcPdf = {
  signed(json) {
    return (
      JSON.stringify(json.qpdf).includes('"/ByteRange"') ||
      JSON.stringify(json.qpdf).includes('"/Type":"/Sig"') ||
      JSON.stringify(json.qpdf).includes('"/FT":"/Sig"')
    );
  },
  canonical(json) {
    const objects = json.qpdf?.[1];
    if (!objects?.trailer) throw new Error("Missing PDF graph");
    const visited = new Map();
    let steps = 0;
    function walk(value, depth = 0, ignore = []) {
      if (++steps > 200000 || depth > 150)
        throw new Error("Complex PDF bypass");
      if (typeof value === "string" && /^\d+ \d+ R$/.test(value)) {
        if (visited.has(value)) return { ref: visited.get(value) };
        const id = visited.size;
        visited.set(value, id);
        const object = objects[`obj:${value}`];
        if (!object) throw new Error("Missing PDF object");
        return { id, object: walk(object, depth + 1) };
      }
      if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((k) => !ignore.includes(k))
            .map((k) => [
              k,
              walk(
                value[k],
                depth + 1,
                k === "dict" && typeof value.data === "string"
                  ? ["/Length"]
                  : [],
              ),
            ]),
        );
      }
      return value;
    }
    return JSON.stringify(
      walk(objects.trailer.value, 0, [
        "/Size",
        "/Prev",
        "/XRefStm",
        "/ID",
        "/Type",
        "/Index",
        "/W",
        "/Length",
        "/Filter",
        "/DecodeParms",
      ]),
    );
  },
};

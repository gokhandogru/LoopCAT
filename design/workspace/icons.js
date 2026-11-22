(() => {
  const paths = {
    folder: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
    file: "M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 15h5",
    files: "M8 6h8l3 3v12H8z M15 6v4h4 M5 17H4V3h10",
    edit: "M4 4h11 M4 9h7 M4 14h4 M4 19h5 M11 19l1-4 7-7 3 3-7 7z M17 10l3 3",
    book: "M3 5c3-1 6 0 9 2 3-2 6-3 9-2v13c-3-1-6 0-9 2-3-2-6-3-9-2z M12 7v13",
    layers: "M3 8l9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5",
    chart: "M4 3v17h17 M8 16v-4 M13 16V7 M18 16v-6",
    check: "m5 12 4 4L19 6",
    circleCheck: "M21 12a9 9 0 1 1-4-7.5 M7.5 11.5l3 3L20 5",
    circle: "M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z",
    draft: "M5 18l1-4L16 4l4 4-10 10-5 1z M14 6l4 4",
    arrow: "M3 12h17m-6-6 6 6-6 6",
    arrowLeft: "M21 12H4m6 6-6-6 6-6",
    plus: "M12 5v14 M5 12h14",
    search: "M16.5 10.5a6 6 0 1 1-12 0 6 6 0 1 1 12 0z M15 15l5 5",
    filter: "M3 7h8 M15 7h6 M3 17h3 M10 17h11 M11 4v6 M7 14v6",
    chevron: "m9 5 7 7-7 7",
    down: "m5 9 7 7 7-7",
    download: "M12 3v12m-5-5 5 5 5-5 M4 16v4h16v-4",
    shield: "m12 3 8 3v5c0 5-3 8-8 11-5-3-8-6-8-11V6z M8 12l3 3 5-6",
    settings: "M3 6h4m4 0h10 M3 12h10m4 0h4 M3 18h3m4 0h11 M7 3v6 M14 9v6 M7 15v6",
    grid: "M3 4h18v16H3z M3 9h18 M9 9v11",
    panel: "M3 4h18v16H3z M14 4v16 M17 8h1 M17 12h1",
    external: "M14 3h7v7 M21 3 10 14 M10 5H4v15h15v-6",
    restore: "M3 6v6h6 M4 11a8 8 0 1 1 2 7 M12 7v5l3 2",
    clock: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M12 7v5l3 2",
    globe: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M3 12h18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18z",
    more: "M5 12h.1 M12 12h.1 M19 12h.1",
    list: "M4 6h2m3 0h11 M4 12h2m3 0h11 M4 18h2m3 0h11",
    tag: "M3 4h9l9 9-8 8-10-10z M7 8h1",
    box: "M3 7l9-5 9 5v10l-9 5-9-5z M3 7l9 5 9-5 M12 12v10 M7 5l9 5",
    monitor: "M3 4h18v13H3z M12 17v4 M8 21h8",
    info: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M12 11v6 M12 7v.5",
    moon: "M20 15A8.5 8.5 0 0 1 9 4a8.7 8.7 0 1 0 11 11Z",
    sun: "M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2",
    expand: "M3 9V3h6 M15 3h6v6 M3 15v6h6 M21 15v6h-6",
    close: "M5 5l14 14 M19 5 5 19",
    next: "M4 12h12m-5-5 5 5-5 5 M20 6v12",
    keyboard: "M2 5h20v14H2z M5 9h1m2 0h1m2 0h1m2 0h1m2 0h1 M6 14h2m2 0h7",
    note: "M4 4h16v12H9l-5 4z M8 8h8 M8 12h5",
    exchange: "M3 8h15l-4-4 M21 16H6l4 4",
    menu: "M3 6h18 M3 12h18 M3 18h18"
  };
  window.loopIcon = (name, size = 18) => {
    const path = paths[name] || paths.info;
    return (
      '<svg width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
      path +
      '"/></svg>'
    );
  };
})();

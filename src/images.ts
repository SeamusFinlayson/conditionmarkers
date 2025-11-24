const normalize = (s: string) =>
    s.toLowerCase().replace(/['-]/g, "").replace(/[ ]/g, "_");

const modules = import.meta.glob("./images/*.svg", { eager: true, import: "default" });

const images: Record<string, string> = {};

for (const path in modules) {
    const fileName = path.split("/").pop()!.replace(".svg", "");
    images[normalize(fileName)] = modules[path] as string;
}

export function getImage(image: string) {
    return images[normalize(image)] ?? images["error"] ?? null;
}
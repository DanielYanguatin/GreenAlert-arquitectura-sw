/** Lee un campo de texto de un formulario de forma segura (FormData puede contener archivos). */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

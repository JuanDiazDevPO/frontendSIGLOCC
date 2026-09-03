import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { CrearUsuarioRequest, Equipo, Rol, UsuarioListado } from './usuarios.models';

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {
  private readonly http = inject(HttpClient);

  private readonly API = `${environment.apiUrl}/usuarios`;

  crearUsuario(data: CrearUsuarioRequest) {
    return this.http.post<UsuarioListado>(this.API, data, { observe: 'response' });
  }

  listarUsuarios() {
    return this.http.get<UsuarioListado[]>(this.API);
  }

  getRoles() {
    return this.http.get<Rol[]>(`${this.API}/roles`);
  }

  getEquipos() {
    return this.http.get<Equipo[]>(`${this.API}/equipos`);
  }

  activarUsuario(id: number) {
    return this.http.patch<unknown>(`${this.API}/${id}/activar`, {});
  }

  inactivarUsuario(id: number) {
    return this.http.patch<unknown>(`${this.API}/${id}/inactivar`, {});
  }
}

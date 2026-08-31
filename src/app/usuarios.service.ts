import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { CrearUsuarioRequest, Equipo, Rol } from './usuarios.models';

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {
  private http = inject(HttpClient);

  private API = `${environment.apiUrl}/usuarios`;

  crearUsuario(data: CrearUsuarioRequest) {
    return this.http.post<unknown>(this.API, data, { observe: 'response' });
  }

  getRoles() {
    return this.http.get<Rol[]>(`${this.API}/roles`);
  }

  getEquipos() {
    return this.http.get<Equipo[]>(`${this.API}/equipos`);
  }
}

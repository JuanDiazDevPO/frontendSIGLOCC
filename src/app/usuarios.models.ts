export interface Rol {
  id: number;
  nombre: string;
}

export interface Equipo {
  id: number;
  nombre: string;
  tipo: string;
}

export interface CrearUsuarioRequest {
  name: string;
  lastname: string;
  email: string;
  password: string;
  roleId: number;
  equipoId: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  type: string;
  usuario: Usuario;
}

export interface Usuario {
  id: number;
  nombreCompleto: string;
  email: string;
  rol: string;
  equipoId: number;
  nombreEquipo: string;
  detallesEquipo: {
    id: number;
    nombre: string;
    tipo: string;
    enlId: number | null;
    erleId: number | null;
  };
}

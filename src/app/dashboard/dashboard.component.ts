import { Component, OnInit } from '@angular/core';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  user: Usuario | null = null;

  constructor(private session: SessionService) {}

  ngOnInit() {
    this.user = this.session.getUser();
  }
}

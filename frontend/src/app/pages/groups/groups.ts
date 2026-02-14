import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Group, Service } from '../../models/models';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './groups.html'
})
export class GroupsPage implements OnInit {
  private api = inject(ApiService);
  groups = signal<Group[]>([]);
  unassigned = signal<Service[]>([]);
  newGroupName = '';
  newGroupNote = '';
  editingGroup = signal<number | null>(null);
  editName = '';
  editNote = '';
  editingLabel = signal<number | null>(null);
  editLabel = '';

  ngOnInit() { this.loadAll(); }

  loadAll() {
    this.api.getGroups().subscribe(g => this.groups.set(g));
    this.api.getServices().subscribe(services => {
      this.unassigned.set(services.filter(s => s.group_id === null));
    });
  }

  formatIdentifier(n: string) {
    if (/^\d{9}$/.test(n)) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
    return n;
  }

  createGroup() {
    if (!this.newGroupName.trim()) return;
    this.api.createGroup(this.newGroupName.trim(), this.newGroupNote.trim() || undefined).subscribe(() => {
      this.newGroupName = '';
      this.newGroupNote = '';
      this.loadAll();
    });
  }

  startEditGroup(group: Group) {
    this.editingGroup.set(group.id);
    this.editName = group.name;
    this.editNote = group.note || '';
  }

  saveGroup(group: Group) {
    this.api.updateGroup(group.id, this.editName, this.editNote || undefined).subscribe(() => {
      this.editingGroup.set(null);
      this.loadAll();
    });
  }

  deleteGroup(group: Group) {
    if (!confirm(`Smazat skupinu "${group.name}"?`)) return;
    this.api.deleteGroup(group.id).subscribe(() => this.loadAll());
  }

  assignToGroup(svc: Service, event: Event) {
    const groupId = Number((event.target as HTMLSelectElement).value);
    if (!groupId) return;
    this.api.updateService(svc.id, groupId).subscribe(() => this.loadAll());
  }

  removeService(svc: Service) {
    if (!confirm(`Odebrat ${svc.identifier} ze skupiny?`)) return;
    this.api.updateService(svc.id, null).subscribe(() => this.loadAll());
  }

  startEditLabel(svc: Service) {
    this.editingLabel.set(svc.id);
    this.editLabel = svc.label || '';
  }

  saveLabel(svc: Service) {
    this.api.updateServiceLabel(svc.id, this.editLabel.trim()).subscribe(() => {
      this.editingLabel.set(null);
      this.loadAll();
    });
  }

  cancelEditLabel() {
    this.editingLabel.set(null);
  }
}

import {
  Component,
  OnInit,
  inject,
  signal,
  DestroyRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Group, Service } from '../../models/models';

@Component({
  selector: 'app-groups',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './groups.html',
})
export class GroupsPage implements OnInit {
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);
  groups = signal<Group[]>([]);
  unassigned = signal<Service[]>([]);
  newGroupName = '';
  newGroupNote = '';
  editingGroup = signal<number | null>(null);
  editName = '';
  editNote = '';
  editingLabel = signal<number | null>(null);
  editLabel = '';

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.api
      .getGroups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((g) => this.groups.set(g));
    this.api
      .getServices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((services) => {
        this.unassigned.set(services.filter((s) => s.group_id === null));
      });
  }

  formatIdentifier(n: string) {
    if (/^\d{9}$/.test(n)) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
    return n;
  }

  createGroup() {
    if (!this.newGroupName.trim()) return;
    this.api
      .createGroup(this.newGroupName.trim(), this.newGroupNote.trim() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
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
    this.api
      .updateGroup(group.id, this.editName, this.editNote || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.editingGroup.set(null);
        this.loadAll();
      });
  }

  deleteGroup(group: Group) {
    if (!confirm(`Smazat skupinu "${group.name}"?`)) return;
    this.api
      .deleteGroup(group.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAll());
  }

  assignToGroup(svc: Service, event: Event) {
    const groupId = Number((event.target as HTMLSelectElement).value);
    if (!groupId) return;
    this.api
      .updateService(svc.id, groupId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAll());
  }

  removeService(svc: Service) {
    if (!confirm(`Odebrat ${svc.identifier} ze skupiny?`)) return;
    this.api
      .updateService(svc.id, null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAll());
  }

  startEditLabel(svc: Service) {
    this.editingLabel.set(svc.id);
    this.editLabel = svc.label || '';
  }

  saveLabel(svc: Service) {
    this.api
      .updateServiceLabel(svc.id, this.editLabel.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.editingLabel.set(null);
        this.loadAll();
      });
  }

  cancelEditLabel() {
    this.editingLabel.set(null);
  }
}

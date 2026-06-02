# AGESPORT en OKD/OpenShift

Despliegue adaptado para OKD 4.x siguiendo el patron usado en este cluster:

- Namespace dedicado `agesport`.
- Build Docker binario dentro del cluster.
- ImageStream interno `agesport:latest`.
- PostgreSQL/PostGIS interno con PVC LVM.
- PVC separado para uploads.
- Route edge con TLS del IngressController.
- NetworkPolicies restrictivas.
- CronJob diario de backup.

## Variables sensibles

No se versionan secretos. Crea `agesport-config` con `oc create secret generic`
antes de aplicar deployments.

Campos minimos:

- `DB_HOST=agesport-postgres`
- `DB_PORT=5432`
- `DB_NAME=agesport_mapa_talento`
- `DB_USER=agesport`
- `DB_PASSWORD=<generado>`
- `JWT_SECRET=<openssl rand -hex 32>`
- `ENCRYPTION_KEY=<openssl rand -hex 16>`
- `ADMIN_INITIAL_EMAIL=<email admin>`
- `ADMIN_INITIAL_PASSWORD=<password temporal>`
- `PUBLIC_BASE_URL=https://agesport-agesport.apps.testing.aiprojects.pro`
- `CORS_ORIGINS=https://agesport-agesport.apps.testing.aiprojects.pro`
- `PORT=3001`
- `HOST=0.0.0.0`
- `UPLOADS_PATH=/app/uploads`

## Orden

```bash
oc apply -f deploy/openshift/00-namespace.yaml
oc -n agesport create secret generic agesport-config ...
oc apply -f deploy/openshift/20-pvc.yaml
oc apply -f deploy/openshift/30-postgres.yaml
oc apply -f deploy/openshift/40-buildconfig.yaml
oc -n agesport start-build agesport --from-dir=. --follow
oc apply -f deploy/openshift/50-db-init-job.yaml
oc -n agesport logs job/agesport-db-init -f
oc apply -f deploy/openshift/60-app.yaml
oc apply -f deploy/openshift/70-networkpolicy.yaml
oc apply -f deploy/openshift/80-cronjob-backup.yaml
```

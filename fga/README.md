# Shared OpenFGA model

Release Please manages this component as `fga-model`. Merging its release PR tags the model as `fga-model-v<version>` and publishes `dev.penvire.lab:fga-model:<version>@json` to Forgejo Maven. The artifact contains the compiled model, including all modules listed in `fga.mod`.

Use a breaking Conventional Commit (`!`) when a model change removes a relation or changes an existing authorization decision. The homepage Playground tracks `main`.

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject, useProjects } from "@/hooks/use-projects";
import { ROUTES, getCanvasRoute } from "@/lib/routes";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectSchema } from "@repo/shared";
import { motion } from "framer-motion";
import { ArrowRight, Image, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import type { z } from "zod";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

type CreateProjectFormData = z.infer<typeof createProjectSchema>;

export function HomePage() {
  const navigate = useNavigate();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState("");
  const { data: projectsData, isLoading: isLoadingProjects } = useProjects(1, 6);
  const createProject = useCreateProject();

  const form = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      isPublic: false,
    },
  });

  const onSubmit = async (data: CreateProjectFormData) => {
    try {
      const project = await createProject.mutateAsync(data);
      setIsCreateDialogOpen(false);
      form.reset();
      navigate(getCanvasRoute(project.id));
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleQuickCreate = async () => {
    if (!quickPrompt.trim()) return;
    try {
      const project = await createProject.mutateAsync({
        name: quickPrompt.slice(0, 50) || "Untitled Project",
        description: quickPrompt,
        isPublic: false,
      });
      // TODO: Pass the prompt to the canvas for auto-generation
      navigate(getCanvasRoute(project.id));
    } catch {
      // Error is handled by the mutation
    }
  };

  const recentProjects = projectsData?.projects || [];

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-12 lg:py-20">
        {/* Hero Section */}
        <motion.div
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            What do you want to create?
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Describe your vision and let AI bring it to life on an infinite canvas
          </p>
        </motion.div>

        {/* Main Input */}
        <motion.div
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-10 max-w-2xl"
        >
          <div className="relative">
            <Sparkles className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickPrompt.trim()) {
                  handleQuickCreate();
                }
              }}
              placeholder="A dreamy landscape with floating islands..."
              className="h-14 pl-12 pr-32 text-lg"
            />
            <Button
              onClick={handleQuickCreate}
              disabled={!quickPrompt.trim() || createProject.isPending}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              {createProject.isPending ? "Creating..." : "Create"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Quick Actions */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New blank project
            </Button>
          </div>
        </motion.div>

        {/* Recent Projects */}
        <motion.div
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-16"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Projects</h2>
            {recentProjects.length > 0 && (
              <Link
                to={ROUTES.PROJECTS}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            )}
          </div>

          {isLoadingProjects ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="h-48 animate-pulse bg-muted" />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <Card className="mt-4 flex flex-col items-center justify-center p-8 text-center">
              <Image className="h-10 w-10 text-muted-foreground" />
              <CardTitle className="mt-4 text-lg">No projects yet</CardTitle>
              <CardDescription className="mt-1">
                Start by describing what you want to create above
              </CardDescription>
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentProjects.map((project) => (
                <Link key={project.id} to={getCanvasRoute(project.id)}>
                  <Card className="group overflow-hidden transition-all hover:ring-2 hover:ring-primary/20">
                    {/* Thumbnail */}
                    <div className="aspect-video bg-muted">
                      {project.images?.[0]?.r2Url ? (
                        <img
                          src={project.images[0].r2Url}
                          alt={project.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Image className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <p className="line-clamp-1 font-medium">{project.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Community Featured - Placeholder */}
        <motion.div
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-16"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Community Featured</h2>
            <span className="text-sm text-muted-foreground">Coming soon</span>
          </div>
          <Card className="mt-4 flex items-center justify-center p-12 text-center">
            <div>
              <Sparkles className="mx-auto h-10 w-10 text-muted-foreground" />
              <CardDescription className="mt-4">
                Discover amazing creations from the community
              </CardDescription>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Create a blank canvas project to start from scratch.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Project Name</Label>
                <Input id="name" placeholder="My Awesome Project" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  placeholder="A brief description of your project"
                  {...form.register("description")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

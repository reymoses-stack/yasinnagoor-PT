package main

import (
	"pioneer-dashboard/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	handlers.Init()

	r := gin.Default()

	// CORS — allow React dev server
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type"},
		ExposeHeaders:    []string{"Content-Disposition"},
		AllowCredentials: false,
	}))

	api := r.Group("/api")
	{
		// Dashboard KPIs + board
		api.GET("/dashboard", handlers.GetDashboard)

		// Projects
		api.GET("/projects",                   handlers.ListProjects)
		api.GET("/projects/:id",               handlers.GetProject)
		api.POST("/projects",                  handlers.CreateProject)
		api.PUT("/projects/:id",               handlers.UpdateProject)
		api.DELETE("/projects/:id",            handlers.DeleteProject)
		api.GET("/projects/:id/assigned",      handlers.GetAssignedEmployees)

		// Employees
		api.GET("/employees",                  handlers.ListEmployees)
		api.POST("/employees",                 handlers.CreateEmployee)
		api.PUT("/employees/:id",              handlers.UpdateEmployee)
		api.DELETE("/employees/:id",           handlers.DeleteEmployee)

		// Excel export
		api.GET("/export/dashboard",           handlers.ExportDashboard)
		api.GET("/export/projects",            handlers.ExportProjects)
		api.GET("/export/employees",           handlers.ExportEmployees)
	}

	r.Run(":8080")
}
